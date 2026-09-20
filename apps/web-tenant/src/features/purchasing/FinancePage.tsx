import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Download,
  Landmark,
  MoreVertical,
  Plus,
  ReceiptText,
  Wallet,
} from 'lucide-react';
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

const formatCurrency = (value: number | undefined) => typeof value === 'number'
  ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

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
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedTransactions, setHasLoadedTransactions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

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

  const periodTransactions = useMemo(() => transactions, [transactions]);
  const payable = periodTransactions.filter((transaction) => transaction.type === 'expense' && (transaction.status === FinancialStatus.PENDING || transaction.status === FinancialStatus.OVERDUE));
  const overdue = payable.filter((transaction) => transaction.status === FinancialStatus.OVERDUE);
  const totalPayable = summary ? summary.payables.pending + summary.payables.overdue : payable.reduce((total, transaction) => total + Number(transaction.amount), 0);
  const totalOverdue = summary ? summary.payables.overdue : overdue.reduce((total, transaction) => total + Number(transaction.amount), 0);
  const estimatedResult = summary ? summary.completedSales - summary.recordedPayments : undefined;

  const handleExport = () => {
    if (!periodTransactions.length) return;
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = periodTransactions.map((transaction) => [
      transaction.category, transaction.description || '', transaction.type === 'income' ? 'Entrada' : 'Saída',
      transaction.amount, statusLabel[transaction.status], format(new Date(dateValue(transaction)), 'dd/MM/yyyy'),
    ].map(escape).join(','));
    const csv = ['Categoria,Descrição,Tipo,Valor,Situação,Data', ...rows].join('\n');
    const link = document.createElement('a');
    link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    link.download = `financeiro_${startDate}_a_${endDate}.csv`;
    link.click();
  };

  const cancelTransaction = async () => {
    if (!selectedTransaction || (selectedTransaction.status !== FinancialStatus.PENDING && selectedTransaction.status !== FinancialStatus.OVERDUE)) return;
    if (!window.confirm('Cancelar este lançamento? Isso não apaga o histórico.')) return;
    setIsCancelling(true);
    try {
      await api.put(`/finance/transactions/${selectedTransaction.id}`, { status: FinancialStatus.CANCELLED });
      setSelectedTransaction(null);
      await loadData();
    } catch {
      setError('Não foi possível cancelar o lançamento. Tente novamente.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl p-4 text-left sm:p-6">
      <header className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-start gap-3"><Wallet className="mt-0.5 h-7 w-7 shrink-0 text-primary" aria-hidden /><div><h1 className="text-2xl font-bold tracking-tight text-foreground">Financeiro</h1><p className="mt-1 text-sm text-muted-foreground">Veja o que vendeu, o que entrou nas contas e o que ainda precisa de atenção.</p></div></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label className="text-xs font-semibold text-muted-foreground">De<input aria-label="Data inicial" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground" /></label>
          <label className="text-xs font-semibold text-muted-foreground">Até<input aria-label="Data final" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground" /></label>
          <button type="button" onClick={handleExport} disabled={!periodTransactions.length} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" aria-hidden />Exportar</button>
          {canManageFinance && (
            <button type="button" onClick={() => setIsNewModalOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Plus className="h-4 w-4" aria-hidden />Novo lançamento</button>
          )}
        </div>
      </header>
      <ContextualNavigation itemIds={['management.finance', 'cash.home', 'analytics.reports']} />
      {error && <p role="alert" className="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {summary && summary.dataQuality.paidWithoutPaymentDate > 0 && <p role="status" className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">Há {summary.dataQuality.paidWithoutPaymentDate} lançamento(s) pago(s) antigo(s) sem data de pagamento. Eles não foram alterados automaticamente; revise cada um antes de definir a data.</p>}

      {canManageFinance && <TransactionModal isOpen={isNewModalOpen} onClose={() => setIsNewModalOpen(false)} onSave={() => void loadData()} />}
      {canManageFinance && selectedTransaction && <TransactionModal isOpen transaction={selectedTransaction} onClose={() => setSelectedTransaction(null)} onSave={() => { setSelectedTransaction(null); void loadData(); }} onCancelPending={() => void cancelTransaction()} isCancelling={isCancelling} />}

      <section className="mb-6" aria-labelledby="finance-flow-title">
        <div className="mb-3 flex items-baseline justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Fluxo no período</p><h2 id="finance-flow-title" className="mt-1 text-lg font-semibold text-foreground">{format(new Date(`${startDate}T12:00:00`), 'dd/MM/yyyy')} a {format(new Date(`${endDate}T12:00:00`), 'dd/MM/yyyy')}</h2></div><span className="text-xs text-muted-foreground">Valores históricos do intervalo</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Vendas concluídas" value={formatCurrency(summary?.completedSales)} detail="Pedidos concluídos. Não significa valor já recebido." icon={ReceiptText} />
          <MetricCard label="Recebido nas contas" value={formatCurrency(summary?.recordedReceipts)} detail="Entradas financeiras registradas no período." icon={ArrowUpCircle} tone="success" />
          <MetricCard label="A receber confirmado" value={formatCurrency(summary?.food99.documentedReceivable)} detail={summary?.food99.documentedReceivableCount ? `${summary.food99.documentedReceivableCount} repasse(s) 99Food documentado(s).` : 'Nenhum repasse 99Food documentado. iFood não está disponível aqui.'} icon={Landmark} tone="attention" compact />
          <MetricCard label="Contas a pagar" value={summary ? formatCurrency(totalPayable) : '—'} detail={summary ? `${formatCurrency(totalOverdue)} vencido • ${formatCurrency(summary.payables.pending)} pendente` : 'Carregando lançamentos...'} icon={ArrowDownCircle} tone={(summary?.payables.overdueCount || overdue.length) ? 'danger' : 'attention'} />
        </div>
      </section>

      <section className="mb-6 grid gap-3 lg:grid-cols-3" aria-label="Posições atuais separadas">
        <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saldo das contas financeiras</p><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(summary?.currentAccountsBalance)}</p><p className="mt-2 text-sm text-muted-foreground">Saldo atual. Não muda com o período acima e não inclui o caixa do turno automaticamente.</p></Card>
        <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caixa operacional</p><p className="mt-2 text-lg font-semibold text-foreground">Sessão de caixa separada</p><p className="mt-2 text-sm text-muted-foreground">Registra o turno do PDV. Não é somado às contas financeiras nesta tela.</p><Link to="/cash" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Abrir caixa e fechamento</Link></Card>
        <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resultado gerencial estimado</p><p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{formatCurrency(estimatedResult)}</p><p className="mt-2 text-sm text-muted-foreground">Vendas menos pagamentos registrados. Não é lucro contábil nem saldo disponível.</p></Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <Card className="overflow-hidden"><div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-semibold text-foreground"><ReceiptText className="mr-2 inline h-4 w-4 text-primary" aria-hidden />Lançamentos do período</h2><p className="mt-1 text-sm text-muted-foreground">Use os detalhes para alterar valores pendentes ou registrar o pagamento.</p></div><span className="text-xs font-medium text-muted-foreground">{periodTransactions.length} {periodTransactions.length === 1 ? 'lançamento' : 'lançamentos'}</span></div>
            <div className="divide-y divide-border" aria-live="polite">{isLoading ? <div className="p-10 text-center text-sm text-muted-foreground">Carregando lançamentos...</div> : !periodTransactions.length ? <div className="p-10 text-center text-sm text-muted-foreground">Nenhum lançamento neste período. Ajuste as datas ou registre uma entrada ou saída.</div> : periodTransactions.map((transaction) => <article key={transaction.id} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/45"><div className="flex min-w-0 items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${transaction.type === 'expense' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>{transaction.type === 'expense' ? <ArrowDownCircle className="h-5 w-5" aria-hidden /> : <ArrowUpCircle className="h-5 w-5" aria-hidden />}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{transaction.description || transaction.category}</p><p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span className="capitalize">{transaction.category}</span>{transaction.accountName && <span>Conta: {transaction.accountName}</span>}<span>{format(new Date(dateValue(transaction)), 'dd/MM/yyyy')}</span></p></div></div><div className="flex shrink-0 items-center gap-2"><div className="text-right"><p className={`text-sm font-semibold ${transaction.type === 'expense' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>{transaction.type === 'expense' ? '-' : '+'} {formatCurrency(Number(transaction.amount))}</p><p className={`mt-0.5 text-[11px] font-semibold uppercase tracking-wide ${transaction.status === FinancialStatus.OVERDUE ? 'text-destructive' : transaction.status === FinancialStatus.PAID ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>{statusLabel[transaction.status]}</p></div>{canManageFinance && <button type="button" onClick={() => setSelectedTransaction(transaction)} aria-label={`Ver detalhes de ${transaction.description || transaction.category}`} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><MoreVertical className="h-4 w-4" aria-hidden /></button>}</div></article>)}</div>
          </Card>
        </div>
        <aside className="space-y-6 xl:col-span-4" aria-label="Contas e pendências"><Card className="p-5"><h2 className="text-base font-semibold text-foreground"><Calendar className="mr-2 inline h-4 w-4 text-primary" aria-hidden />Contas a pagar</h2><p className="mt-1 text-sm text-muted-foreground">Somente saídas pendentes e vencidas neste período. Canceladas não entram.</p><div className="mt-5 space-y-3">{isLoading || !hasLoadedTransactions ? <p className="py-2 text-sm text-muted-foreground">Carregando pendências...</p> : !payable.length ? <p className="py-2 text-sm text-muted-foreground">Nenhuma conta pendente neste período.</p> : payable.slice(0, 5).map((transaction) => <div key={transaction.id} className="flex items-start justify-between gap-3 text-sm"><div className="min-w-0"><p className="truncate text-foreground">{transaction.description || transaction.category}</p><p className={transaction.status === FinancialStatus.OVERDUE ? 'mt-1 text-xs font-semibold text-destructive' : 'mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400'}>{statusLabel[transaction.status]}</p></div><p className="shrink-0 font-medium text-foreground">{formatCurrency(Number(transaction.amount))}</p></div>)}<div className="flex items-center justify-between border-t border-border pt-4 text-sm"><span className="font-semibold text-foreground">Total a pagar</span><span className="font-semibold text-destructive">{hasLoadedTransactions ? formatCurrency(totalPayable) : '—'}</span></div></div></Card>
          <Card className="p-5"><h2 className="text-base font-semibold text-foreground">Antes de editar</h2><p className="mt-2 text-sm text-muted-foreground">Valores confirmados mantêm seu histórico. Apenas lançamentos pendentes podem ser cancelados.</p></Card></aside>
      </div>
      <Food99ReconciliationPanel canManage={canManageFinance} startDate={startDate} endDate={endDate} />
    </main>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'default', compact = false }: { label: string; value: string; detail: string; icon: typeof Wallet; tone?: 'default' | 'success' | 'attention' | 'danger'; compact?: boolean }) {
  const toneClass = tone === 'success' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'danger' ? 'text-destructive' : tone === 'attention' ? 'text-amber-700 dark:text-amber-400' : 'text-foreground';
  return <Card className="min-w-0 p-5"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><Icon className={`h-4 w-4 shrink-0 ${toneClass}`} aria-hidden /></div><p className={`mt-3 break-words font-semibold tracking-tight tabular-nums ${compact ? 'text-lg' : 'text-2xl'} ${toneClass}`}>{value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p></Card>;
}
