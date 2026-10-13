import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, Download, Landmark, MoreHorizontal, PanelRightClose, Plus, ReceiptText, Search, Wallet, X } from 'lucide-react';
import { FinancialStatus, FinancialTransactionDTO } from '@gestor/types';

import { api } from '../../lib/api-client';
import { Card } from '../../components/ui/Card';
import { usePermissions } from '../../hooks/use-tenant-auth';
import { ContextualNavigation } from '../navigation/NavigationHub';
import { Food99ReconciliationPanel } from './Food99ReconciliationPanel';
import { TransactionModal } from './TransactionModal';

interface FinanceSummary {
  completedSales: number;
  recordedReceipts: number;
  recordedPayments: number;
  currentAccountsBalance: number;
  payables: { pending: number; pendingCount: number; overdue: number; overdueCount: number };
  food99: { documentedReceivable: number; documentedReceivableCount: number; received: number; receivedCount: number; discrepancyCount: number };
  dataQuality: { paidWithoutPaymentDate: number };
}

type FinanceTab = 'transactions' | 'settlements' | 'payables' | 'channels';

const PAGE_SIZE = 20;
const formatCurrency = (value: number | undefined) => typeof value === 'number' ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
const dateValue = (transaction: FinancialTransactionDTO) => transaction.paymentDate || transaction.dueDate || transaction.createdAt;
const statusLabel: Record<FinancialStatus, string> = {
  [FinancialStatus.PAID]: 'Confirmado',
  [FinancialStatus.PENDING]: 'Pendente',
  [FinancialStatus.OVERDUE]: 'Vencido',
  [FinancialStatus.CANCELLED]: 'Cancelado',
};

export function FinancePage() {
  const { has } = usePermissions();
  const canManageFinance = has('finance.manage');
  const defaultEnd = format(new Date(), 'yyyy-MM-dd');
  const defaultStart = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [transactions, setTransactions] = useState<FinancialTransactionDTO[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransactionDTO | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransactionDTO | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedTransactions, setHasLoadedTransactions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<FinanceTab>('transactions');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const [summaryResult, transactionsResult] = await Promise.allSettled([
      api.get<FinanceSummary>(`/finance/summary?startDate=${startDate}&endDate=${endDate}`),
      api.get<FinancialTransactionDTO[]>(`/finance/transactions?startDate=${startDate}&endDate=${endDate}`),
    ]);
    if (summaryResult.status === 'fulfilled' && summaryResult.value.success) setSummary(summaryResult.value.data);
    if (transactionsResult.status === 'fulfilled' && transactionsResult.value.success) {
      setTransactions(transactionsResult.value.data);
      setHasLoadedTransactions(true);
    } else {
      setError('Não foi possível carregar os lançamentos. Tente atualizar a página.');
    }
    setIsLoading(false);
  }, [endDate, startDate]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [searchQuery, startDate, endDate]);

  const payable = useMemo(() => transactions.filter((transaction) => transaction.type === 'expense' && (transaction.status === FinancialStatus.PENDING || transaction.status === FinancialStatus.OVERDUE)), [transactions]);
  const overdue = payable.filter((transaction) => transaction.status === FinancialStatus.OVERDUE);
  const totalPayable = summary ? summary.payables.pending + summary.payables.overdue : payable.reduce((total, transaction) => total + Number(transaction.amount), 0);
  const totalOverdue = summary ? summary.payables.overdue : overdue.reduce((total, transaction) => total + Number(transaction.amount), 0);
  const estimatedResult = summary ? summary.completedSales - summary.recordedPayments : undefined;
  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('pt-BR');
    if (!query) return transactions;
    return transactions.filter((transaction) => [transaction.description, transaction.category, transaction.accountName, statusLabel[transaction.status]].filter((value): value is string => Boolean(value)).some((value) => value.toLocaleLowerCase('pt-BR').includes(query)));
  }, [transactions, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleTransactions = filteredTransactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleExport = () => {
    if (!transactions.length) return;
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = transactions.map((transaction) => [transaction.category, transaction.description || '', transaction.type === 'income' ? 'Entrada' : 'Saída', transaction.amount, statusLabel[transaction.status], format(new Date(dateValue(transaction)), 'dd/MM/yyyy')].map(escape).join(','));
    const link = document.createElement('a');
    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(['Categoria,Descrição,Tipo,Valor,Situação,Data', ...rows].join('\n'))}`;
    link.download = `financeiro_${startDate}_a_${endDate}.csv`;
    link.click();
  };

  const cancelTransaction = async () => {
    if (!editingTransaction || (editingTransaction.status !== FinancialStatus.PENDING && editingTransaction.status !== FinancialStatus.OVERDUE)) return;
    if (!window.confirm('Cancelar este lançamento? Isso não apaga o histórico.')) return;
    setIsCancelling(true);
    try {
      await api.put(`/finance/transactions/${editingTransaction.id}`, { status: FinancialStatus.CANCELLED });
      setEditingTransaction(null);
      await loadData();
    } catch {
      setError('Não foi possível cancelar o lançamento. Tente novamente.');
    } finally {
      setIsCancelling(false);
    }
  };

  const selectTab = (tab: FinanceTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  return (
    <main className="mx-auto max-w-7xl p-4 text-left sm:p-6">
      <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-start gap-3"><Wallet className="mt-0.5 h-7 w-7 shrink-0 text-primary" aria-hidden /><div><h1 className="text-2xl font-bold tracking-tight text-foreground">Financeiro</h1><p className="mt-1 text-sm text-muted-foreground">Vendas, valores recebidos, recebíveis confirmados e compromissos do período.</p></div></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label className="text-xs font-semibold text-muted-foreground">De<input aria-label="Data inicial" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground" /></label>
          <label className="text-xs font-semibold text-muted-foreground">Até<input aria-label="Data final" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground" /></label>
          <button type="button" onClick={handleExport} disabled={!transactions.length} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" aria-hidden />Exportar</button>
          {canManageFinance && <button type="button" onClick={() => setIsNewModalOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Plus className="h-4 w-4" aria-hidden />Novo lançamento</button>}
        </div>
      </header>
      <ContextualNavigation itemIds={['management.finance', 'cash.home', 'analytics.reports']} />
      {error && <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"><span>{error}</span><button type="button" onClick={() => void loadData()} className="shrink-0 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Tentar de novo</button></div>}
      {summary && summary.dataQuality.paidWithoutPaymentDate > 0 && <p role="status" className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground">Há {summary.dataQuality.paidWithoutPaymentDate} lançamento(s) pago(s) antigo(s) sem data de pagamento. Eles não foram alterados automaticamente; revise cada um antes de definir a data.</p>}

      {canManageFinance && <TransactionModal isOpen={isNewModalOpen} onClose={() => setIsNewModalOpen(false)} onSave={() => void loadData()} />}
      {canManageFinance && editingTransaction && <TransactionModal isOpen transaction={editingTransaction} onClose={() => setEditingTransaction(null)} onSave={() => { setEditingTransaction(null); void loadData(); }} onCancelPending={() => void cancelTransaction()} isCancelling={isCancelling} />}

      <section className="mb-5" aria-labelledby="finance-flow-title">
        <div className="mb-3 flex items-baseline justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Fluxo no período</p><h2 id="finance-flow-title" className="mt-1 text-lg font-semibold text-foreground">{format(new Date(`${startDate}T12:00:00`), 'dd/MM/yyyy')} a {format(new Date(`${endDate}T12:00:00`), 'dd/MM/yyyy')}</h2></div><span className="text-xs text-muted-foreground">Valores históricos do intervalo</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Vendas concluídas" value={formatCurrency(summary?.completedSales)} detail="Pedidos concluídos; não significa valor já recebido." icon={ReceiptText} />
          <MetricCard label="Recebido nas contas" value={formatCurrency(summary?.recordedReceipts)} detail="Entradas financeiras registradas no período." icon={ArrowUpCircle} tone="success" />
          <MetricCard label="A receber confirmado" value={formatCurrency(summary?.food99.documentedReceivable)} detail={summary?.food99.documentedReceivableCount ? `${summary.food99.documentedReceivableCount} repasse(s) 99Food documentado(s).` : 'Nenhum repasse 99Food documentado. iFood não está disponível aqui.'} icon={Landmark} tone="attention" compact />
          <MetricCard label="Contas a pagar" value={summary ? formatCurrency(totalPayable) : '—'} detail={summary ? `${formatCurrency(totalOverdue)} vencido • ${formatCurrency(summary.payables.pending)} pendente` : 'Carregando lançamentos...'} icon={ArrowDownCircle} tone={(summary?.payables.overdueCount || overdue.length) ? 'danger' : 'attention'} />
        </div>
      </section>

      <section className="mb-5 grid gap-3 lg:grid-cols-3" aria-label="Posições atuais separadas">
        <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saldo das contas financeiras</p><p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{formatCurrency(summary?.currentAccountsBalance)}</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">Saldo atual; não muda com o período acima e não inclui o caixa do turno.</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caixa operacional</p><p className="mt-2 text-sm font-semibold text-foreground">Sessão de caixa separada</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">Não é somado às contas financeiras nesta tela.</p><Link to="/cash" className="mt-2 inline-flex min-h-8 items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Abrir caixa e fechamento</Link></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resultado gerencial estimado</p><p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{formatCurrency(estimatedResult)}</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">Vendas menos pagamentos registrados. Não é lucro contábil nem saldo disponível.</p></Card>
      </section>

      <section aria-labelledby="finance-workspace-title">
        <div className="border-b border-border"><h2 id="finance-workspace-title" className="sr-only">Área de trabalho financeira</h2><div className="-mb-px flex gap-1 overflow-x-auto" role="tablist" aria-label="Visões financeiras">
          <WorkspaceTab active={activeTab === 'transactions'} onClick={() => selectTab('transactions')} label="Transações" />
          <WorkspaceTab active={activeTab === 'settlements'} onClick={() => selectTab('settlements')} label="Repasses" />
          <WorkspaceTab active={activeTab === 'payables'} onClick={() => selectTab('payables')} label="Contas a pagar" />
          <WorkspaceTab active={activeTab === 'channels'} onClick={() => selectTab('channels')} label="Por canal" />
        </div></div>
        <div className="pt-4">
          {activeTab === 'transactions' && <TransactionsWorkspace transactions={visibleTransactions} total={filteredTransactions.length} page={currentPage} totalPages={totalPages} searchQuery={searchQuery} isLoading={isLoading} onSearchChange={setSearchQuery} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} onSelect={setSelectedTransaction} />}
          {activeTab === 'settlements' && <Food99ReconciliationPanel canManage={canManageFinance} startDate={startDate} endDate={endDate} />}
          {activeTab === 'payables' && <PayablesWorkspace payable={payable} isLoading={isLoading || !hasLoadedTransactions} totalPayable={totalPayable} onSelect={setSelectedTransaction} />}
          {activeTab === 'channels' && <ChannelWorkspace isLoading={isLoading} />}
        </div>
      </section>
      <TransactionDrawer transaction={selectedTransaction} canManage={canManageFinance} onClose={() => setSelectedTransaction(null)} onEdit={(transaction) => { setSelectedTransaction(null); setEditingTransaction(transaction); }} />
    </main>
  );
}

function WorkspaceTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`min-h-10 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}`}>{label}</button>;
}

function TransactionsWorkspace({ transactions, total, page, totalPages, searchQuery, isLoading, onSearchChange, onPrevious, onNext, onSelect }: { transactions: FinancialTransactionDTO[]; total: number; page: number; totalPages: number; searchQuery: string; isLoading: boolean; onSearchChange: (value: string) => void; onPrevious: () => void; onNext: () => void; onSelect: (transaction: FinancialTransactionDTO) => void }) {
  return <Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-base font-semibold text-foreground">Transações do período</h3><p className="mt-1 text-sm text-muted-foreground">{total} {total === 1 ? 'lançamento encontrado' : 'lançamentos encontrados'}</p></div><label className="relative block sm:w-72"><span className="sr-only">Buscar lançamentos</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><input value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar descrição ou categoria" className="min-h-10 w-full rounded-lg border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />{searchQuery && <button type="button" aria-label="Limpar busca" onClick={() => onSearchChange('')} className="absolute right-1.5 top-1/2 rounded p-1 -translate-y-1/2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-4 w-4" aria-hidden /></button>}</label></div>
    {isLoading ? <div className="p-10 text-center text-sm text-muted-foreground">Carregando lançamentos...</div> : !transactions.length ? <div className="p-10 text-center text-sm text-muted-foreground">{searchQuery ? 'Nenhum lançamento corresponde à busca.' : 'Nenhum lançamento neste período. Ajuste as datas ou registre uma entrada ou saída.'}</div> : <><div className="hidden divide-y divide-border md:block"><div className="grid grid-cols-[minmax(0,1.5fr)_0.8fr_0.7fr_0.7fr_auto] gap-4 bg-muted/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span>Descrição</span><span>Categoria</span><span>Data</span><span className="text-right">Valor</span><span className="sr-only">Detalhes</span></div>{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onSelect={onSelect} />)}</div><div className="divide-y divide-border md:hidden">{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onSelect={onSelect} compact />)}</div></>}
    {total > PAGE_SIZE && <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm"><span className="text-muted-foreground">Página {page} de {totalPages}</span><div className="flex gap-2"><button type="button" onClick={onPrevious} disabled={page === 1} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><ChevronLeft className="h-4 w-4" aria-hidden />Anterior</button><button type="button" onClick={onNext} disabled={page === totalPages} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Próxima<ChevronRight className="h-4 w-4" aria-hidden /></button></div></div>}
  </Card>;
}

function TransactionRow({ transaction, onSelect, compact = false }: { transaction: FinancialTransactionDTO; onSelect: (transaction: FinancialTransactionDTO) => void; compact?: boolean }) {
  const expense = transaction.type === 'expense';
  const statusTone = transaction.status === FinancialStatus.OVERDUE ? 'text-destructive' : transaction.status === FinancialStatus.PAID ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400';
  if (compact) return <button type="button" onClick={() => onSelect(transaction)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{transaction.description || transaction.category}</p><p className="mt-1 text-xs text-muted-foreground">{transaction.category} · {format(new Date(dateValue(transaction)), 'dd/MM/yyyy')}</p></div><div className="shrink-0 text-right"><p className={`text-sm font-semibold tabular-nums ${expense ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>{expense ? '-' : '+'} {formatCurrency(Number(transaction.amount))}</p><p className={`mt-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone}`}>{statusLabel[transaction.status]}</p></div></button>;
  return <div className="grid grid-cols-[minmax(0,1.5fr)_0.8fr_0.7fr_0.7fr_auto] items-center gap-4 px-4 py-3 hover:bg-muted/45"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{transaction.description || transaction.category}</p><p className={`mt-1 text-[11px] font-semibold uppercase tracking-wide ${statusTone}`}>{statusLabel[transaction.status]}</p></div><span className="truncate text-sm text-muted-foreground">{transaction.category}</span><span className="text-sm text-muted-foreground">{format(new Date(dateValue(transaction)), 'dd/MM/yyyy')}</span><span className={`text-right text-sm font-semibold tabular-nums ${expense ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>{expense ? '-' : '+'} {formatCurrency(Number(transaction.amount))}</span><button type="button" onClick={() => onSelect(transaction)} aria-label={`Ver detalhes de ${transaction.description || transaction.category}`} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><MoreHorizontal className="h-4 w-4" aria-hidden /></button></div>;
}

function PayablesWorkspace({ payable, isLoading, totalPayable, onSelect }: { payable: FinancialTransactionDTO[]; isLoading: boolean; totalPayable: number; onSelect: (transaction: FinancialTransactionDTO) => void }) {
  return <Card className="overflow-hidden"><div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4"><div><h3 className="text-base font-semibold text-foreground">Contas a pagar</h3><p className="mt-1 text-sm text-muted-foreground">Somente saídas pendentes e vencidas. Canceladas não entram.</p></div><p className="shrink-0 text-sm font-semibold tabular-nums text-destructive">{formatCurrency(totalPayable)}</p></div>{isLoading ? <p className="p-8 text-sm text-muted-foreground">Carregando pendências...</p> : !payable.length ? <p className="p-8 text-sm text-muted-foreground">Nenhuma conta pendente neste período.</p> : <div className="divide-y divide-border">{payable.map((transaction) => <button key={transaction.id} type="button" onClick={() => onSelect(transaction)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{transaction.description || transaction.category}</p><p className={transaction.status === FinancialStatus.OVERDUE ? 'mt-1 text-xs font-semibold text-destructive' : 'mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400'}>{statusLabel[transaction.status]} · {format(new Date(dateValue(transaction)), 'dd/MM/yyyy')}</p></div><p className="shrink-0 font-semibold tabular-nums text-destructive">{formatCurrency(Number(transaction.amount))}</p></button>)}</div>}</Card>;
}

function ChannelWorkspace({ isLoading }: { isLoading: boolean }) {
  return <Card className="p-4"><h3 className="text-base font-semibold text-foreground">Por canal</h3>{isLoading ? <p className="py-8 text-sm text-muted-foreground">Carregando resumo...</p> : <p className="py-8 text-sm text-muted-foreground">Ainda não há um resumo por canal confiável nesta visão. Os lançamentos atuais não informam a origem de forma consistente.</p>}</Card>;
}

function TransactionDrawer({ transaction, canManage, onClose, onEdit }: { transaction: FinancialTransactionDTO | null; canManage: boolean; onClose: () => void; onEdit: (transaction: FinancialTransactionDTO) => void }) {
  if (!transaction) return null;
  const expense = transaction.type === 'expense';
  const dateLabel = transaction.paymentDate ? 'Data de pagamento' : transaction.dueDate ? 'Vencimento' : 'Registrado em';
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="presentation"><button type="button" aria-label="Fechar detalhes" onClick={onClose} className="absolute inset-0 cursor-default" /><aside role="dialog" aria-modal="true" aria-labelledby="transaction-drawer-title" className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200"><div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Detalhes do lançamento</p><h2 id="transaction-drawer-title" className="mt-1 text-lg font-semibold text-foreground">{transaction.description || transaction.category}</h2></div><button type="button" aria-label="Fechar detalhes" onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><PanelRightClose className="h-5 w-5" aria-hidden /></button></div><div className="space-y-5 px-5 py-5"><div className="flex items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">{expense ? 'Saída' : 'Entrada'}</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${expense ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>{expense ? '-' : '+'} {formatCurrency(Number(transaction.amount))}</p></div><span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-foreground">{statusLabel[transaction.status]}</span></div><dl className="divide-y divide-border rounded-lg border border-border"><DrawerItem label="Categoria" value={transaction.category} /><DrawerItem label={dateLabel} value={format(new Date(dateValue(transaction)), 'dd/MM/yyyy')} /><DrawerItem label="Conta financeira" value={transaction.accountName || 'Não vinculada'} />{transaction.description && <DrawerItem label="Descrição" value={transaction.description} />}</dl><p className="text-xs leading-5 text-muted-foreground">Referências técnicas e identificadores do provedor não são exibidos nesta visão.</p>{canManage && <button type="button" onClick={() => onEdit(transaction)} className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Editar lançamento</button>}</div></aside></div>;
}

function DrawerItem({ label, value }: { label: string; value: string }) {
  return <div className="px-3 py-3"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-foreground">{value}</dd></div>;
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'default', compact = false }: { label: string; value: string; detail: string; icon: typeof Wallet; tone?: 'default' | 'success' | 'attention' | 'danger'; compact?: boolean }) {
  const toneClass = tone === 'success' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'danger' ? 'text-destructive' : tone === 'attention' ? 'text-amber-700 dark:text-amber-400' : 'text-foreground';
  return <Card className="min-w-0 p-4"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><Icon className={`h-4 w-4 shrink-0 ${toneClass}`} aria-hidden /></div><p className={`mt-3 break-words font-semibold tracking-tight tabular-nums ${compact ? 'text-lg' : 'text-2xl'} ${toneClass}`}>{value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p></Card>;
}
