import { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Building,
  Calendar,
  Download,
  Landmark,
  MoreVertical,
  Plus,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import { format } from 'date-fns';
import { FinancialTransactionDTO } from '@gestor/types';

import { TransactionModal } from './TransactionModal';
import { ContextualNavigation } from '../navigation/NavigationHub';
import { Card } from '../../components/ui/Card';

interface DashboardMetrics {
  financial: {
    cashBalance: number;
    totalIncome: number;
    totalExpenses: number;
  };
  commercial: {
    totalRevenue: number;
    totalOrders: number;
    averageTicket: number;
  };
  costs: {
    estimatedCMV: number;
    estimatedGrossMargin: number;
    grossMarginPercentage: number;
  };
}

const formatCurrency = (value: number | undefined) => (
  typeof value === 'number'
    ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : '—'
);

export function FinancePage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [transactions, setTransactions] = useState<FinancialTransactionDTO[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedTransactions, setHasLoadedTransactions] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const today = format(new Date(), 'yyyy-MM-dd');
      const [metricsResult, transactionsResult] = await Promise.allSettled([
        api.get<DashboardMetrics>(`/analytics/dashboard?startDate=${today}&endDate=${today}`),
        api.get<FinancialTransactionDTO[]>('/finance/transactions')
      ]);

      if (metricsResult.status === 'fulfilled' && metricsResult.value.success) {
        setMetrics(metricsResult.value.data);
      }
      if (transactionsResult.status === 'fulfilled' && transactionsResult.value.success) {
        setTransactions(transactionsResult.value.data);
        setHasLoadedTransactions(true);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (transactions.length === 0) return;

    const headers = ['Categoria', 'Descrição', 'Tipo', 'Valor', 'Status', 'Data'];
    const rows = transactions.map((t) => [
      t.category,
      t.description || '',
      t.type === 'income' ? 'Entrada' : 'Saída',
      t.amount,
      t.status,
      t.paymentDate ? format(new Date(t.paymentDate), 'dd/MM/yyyy') : format(new Date(t.createdAt), 'dd/MM/yyyy')
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,'
      + headers.join(',') + '\n'
      + rows.map((entry) => entry.join(',')).join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `financeiro_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const operationalProfit = metrics
    ? metrics.financial.totalIncome - metrics.financial.totalExpenses
    : undefined;
  const operationalMargin = metrics && metrics.financial.totalIncome > 0
    ? ((metrics.financial.totalIncome - metrics.financial.totalExpenses) / metrics.financial.totalIncome) * 100
    : undefined;
  const netProfit = metrics
    ? metrics.costs.estimatedGrossMargin - metrics.financial.totalExpenses
    : undefined;
  const pendingExpenses = transactions.filter((transaction) => transaction.type === 'expense' && transaction.status !== 'paid');
  const pendingTotal = hasLoadedTransactions
    ? pendingExpenses.reduce((total, transaction) => total + Number(transaction.amount), 0)
    : undefined;

  return (
    <main className="mx-auto max-w-7xl p-4 text-left sm:p-6">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Wallet className="mt-0.5 h-7 w-7 shrink-0 text-primary" aria-hidden />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Financeiro</h1>
            <p className="mt-1 text-sm text-muted-foreground">Acompanhe o caixa, lançamentos e resultado do negócio no período disponível.</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={handleExport}
              disabled={transactions.length === 0}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden /> Exportar
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden /> Novo lançamento
            </button>
        </div>
      </header>

      <ContextualNavigation itemIds={['management.finance', 'cash.home', 'analytics.reports']} />

      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={loadData}
      />

      <section className="mb-6" aria-labelledby="finance-overview-title">
        <Card className="overflow-hidden border-primary/25">
          <div className="border-b border-border bg-muted/35 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Visão financeira</p>
                <h2 id="finance-overview-title" className="mt-1 text-lg font-semibold tracking-tight text-foreground">Posição e resultado do dia</h2>
              </div>
              <span className="text-sm text-muted-foreground">Dados do painel financeiro</span>
            </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-12">
            <PrimaryBalance value={formatCurrency(metrics?.financial.cashBalance)} />
            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:col-span-7 xl:grid-cols-3">
              <SummaryMetric label="Entradas" value={formatCurrency(metrics?.financial.totalIncome)} detail={`Vendas: ${formatCurrency(metrics?.commercial.totalRevenue)}`} icon={ArrowUpCircle} tone="income" />
              <SummaryMetric label="Saídas" value={formatCurrency(metrics?.financial.totalExpenses)} detail={`CMV estimado: ${formatCurrency(metrics?.costs.estimatedCMV)}`} icon={ArrowDownCircle} tone="expense" />
              <SummaryMetric label="Lucro operacional" value={formatCurrency(operationalProfit)} detail={operationalMargin === undefined ? 'Margem indisponível' : `Margem: ${operationalMargin.toFixed(1)}%`} icon={Wallet} tone="primary" />
            </div>
          </div>
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <Card className="p-5 sm:p-6">
            <SectionHeading icon={ReceiptText} title="DRE gerencial" description="Composição do resultado com os dados disponíveis." />
            <dl className="mt-5 divide-y divide-border text-sm">
              <DreLine label="Receita operacional bruta" value={formatCurrency(metrics?.commercial.totalRevenue)} />
              <DreLine className="pl-4" label="(-) CMV — Custo de mercadoria vendida" value={formatCurrency(metrics?.costs.estimatedCMV)} tone="expense" prefix="- " />
              <DreLine className="bg-muted/55 px-3 font-semibold" label="(=) Margem bruta" value={`${formatCurrency(metrics?.costs.estimatedGrossMargin)}${metrics ? ` (${metrics.costs.grossMarginPercentage.toFixed(1)}%)` : ''}`} tone="primary" />
              <DreLine className="pl-4" label="(-) Despesas operacionais" value={formatCurrency(metrics?.financial.totalExpenses)} tone="expense" prefix="- " />
              <DreLine className="mt-2 rounded-lg bg-primary px-3" label="(=) Lucro líquido" value={formatCurrency(netProfit)} tone="inverse" strong />
            </dl>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <SectionHeading icon={Calendar} title="Últimos lançamentos" description="Entradas e saídas recentes." compact />
              <span className="text-xs font-medium text-muted-foreground">{transactions.length} {transactions.length === 1 ? 'lançamento' : 'lançamentos'}</span>
            </div>
            <div className="divide-y divide-border" aria-live="polite">
              {isLoading ? (
                <div className="p-10 text-center text-sm text-muted-foreground">Carregando lançamentos...</div>
              ) : transactions.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">Nenhum lançamento encontrado.</div>
              ) : (
                transactions.slice(0, 10).map((transaction) => (
                  <article key={transaction.id} className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-muted/45 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${transaction.type === 'expense' ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                        {transaction.type === 'expense' ? <ArrowDownCircle className="h-5 w-5" aria-hidden /> : <ArrowUpCircle className="h-5 w-5" aria-hidden />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{transaction.description || transaction.category}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          <span className="capitalize">{transaction.category}</span>
                          {transaction.accountName && <span>Conta: {transaction.accountName}</span>}
                          <span>{format(new Date(transaction.paymentDate || transaction.createdAt), 'dd/MM/yyyy')}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${transaction.type === 'expense' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {transaction.type === 'expense' ? '-' : '+'} {formatCurrency(Number(transaction.amount))}
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {transaction.status === 'paid' ? 'Pago' : 'Pendente'}
                        </p>
                      </div>
                      <button type="button" aria-label={`Mais ações para ${transaction.description || transaction.category}`} className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <MoreVertical className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-6 xl:col-span-4" aria-label="Contas e pendências">
          <Card className="p-5 sm:p-6">
            <SectionHeading icon={Building} title="Conta acompanhada" description="Saldo informado pelo painel financeiro." />
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-border bg-muted/35 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-sm"><Banknote className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caixa interno</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">{formatCurrency(metrics?.financial.cashBalance)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <SectionHeading icon={Calendar} title="Contas a pagar" description="Saídas pendentes entre os lançamentos carregados." />
            <div className="mt-5 space-y-3">
              {isLoading || !hasLoadedTransactions ? (
                <p className="py-2 text-sm text-muted-foreground">Carregando pendências...</p>
              ) : pendingExpenses.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Nenhuma conta pendente.</p>
              ) : (
                pendingExpenses.slice(0, 5).map((transaction) => (
                  <div key={transaction.id} className="flex items-start justify-between gap-3 text-sm">
                    <p className="min-w-0 truncate text-muted-foreground">{transaction.description || transaction.category}</p>
                    <p className="shrink-0 font-medium text-foreground">{formatCurrency(Number(transaction.amount))}</p>
                  </div>
                ))
              )}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
                <span className="font-semibold text-foreground">Total a vencer</span>
                <span className="font-semibold text-destructive">{formatCurrency(pendingTotal)}</span>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </main>
  );
}

type SummaryMetricProps = {
  label: string;
  value: string;
  detail: string;
  icon: typeof Wallet;
  tone?: 'income' | 'expense' | 'primary';
};

function SummaryMetric({ label, value, detail, icon: Icon, tone }: SummaryMetricProps) {
  const toneClasses = tone === 'income'
    ? 'text-emerald-700 dark:text-emerald-400'
    : tone === 'expense'
      ? 'text-destructive'
      : tone === 'primary'
        ? 'text-primary'
        : 'text-foreground';

  return (
    <div className="min-w-0 bg-card px-5 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 shrink-0 ${toneClasses}`} aria-hidden />
      </div>
      <p className={`mt-3 break-words text-xl font-semibold tracking-tight tabular-nums ${toneClasses}`}>{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, description, compact = false }: { icon: typeof Wallet; title: string; description: string; compact?: boolean }) {
  return (
    <div className={compact ? '' : 'flex items-start gap-3'}>
      {!compact && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />}
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{compact && <Icon className="mr-2 inline h-4 w-4 text-primary" aria-hidden />}{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function PrimaryBalance({ value }: { value: string }) {
  return (
    <div className="bg-primary px-5 py-6 text-primary-foreground sm:px-6 xl:col-span-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground/75">Saldo em contas</p>
          <p className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{value}</p>
          <p className="mt-3 text-sm text-primary-foreground/80">Disponível no caixa interno</p>
        </div>
        <Landmark className="h-6 w-6 shrink-0 text-primary-foreground/80" aria-hidden />
      </div>
    </div>
  );
}

function DreLine({ label, value, tone, prefix = '', strong = false, className = '' }: { label: string; value: string; tone?: 'expense' | 'primary' | 'inverse'; prefix?: string; strong?: boolean; className?: string }) {
  const valueClass = tone === 'expense' ? 'text-destructive' : tone === 'primary' ? 'text-primary' : tone === 'inverse' ? 'text-primary-foreground' : 'text-foreground';
  return (
    <div className={`flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${className}`}>
      <dt className={strong ? 'font-semibold text-primary-foreground' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`break-words sm:shrink-0 sm:text-right ${strong ? 'font-semibold' : 'font-medium'} ${valueClass}`}>{prefix}{value}</dd>
    </div>
  );
}
