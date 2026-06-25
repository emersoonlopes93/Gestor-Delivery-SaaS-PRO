import { BillingOverview } from '../admin-billing-api';
import { money } from '../types';
import { AlertTriangle, BadgeDollarSign, CalendarClock, CheckCircle2, ClipboardList, Receipt, Store, TrendingUp } from 'lucide-react';
import { Panel, MetricCard, EmptyState, LoadingBlock } from './BillingShared';

export function OverviewTab(props: { overview?: BillingOverview; loading: boolean }) {
  const { overview, loading } = props;
  if (loading) return <LoadingBlock />;
  if (!overview) {
    return <EmptyState icon={TrendingUp} title="Sem dados de overview" text="O backend não retornou métricas para o console de billing." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tenants com billing novo" value={overview.tenantsWithBilling} icon={Store} />
        <MetricCard label="Invoices draft" value={overview.draftInvoices} icon={Receipt} />
        <MetricCard label="Ciclos abertos" value={overview.openCycles} icon={CalendarClock} />
        <MetricCard label="Ciclos fechados" value={overview.closedCycles} icon={ClipboardList} />
        <MetricCard label="Faturamento apurado no mês" value={money(overview.monthBillableRevenue)} icon={TrendingUp} />
        <MetricCard label="Receita SaaS estimada" value={money(overview.estimatedSaasRevenue)} icon={BadgeDollarSign} />
        <MetricCard label="Tenants em trial" value={overview.trialingSubscriptions} icon={AlertTriangle} tone="text-amber-600" />
        <MetricCard label="Tenants ativos" value={overview.activeSubscriptions} icon={CheckCircle2} tone="text-emerald-600" />
      </div>
      <Panel>
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-muted-foreground">Tenants sem assinatura billing nova</p>
            <p className="mt-1 text-3xl font-black text-foreground">{overview.tenantsWithoutNewBilling}</p>
          </div>
          <p className="max-w-2xl text-sm font-semibold text-muted-foreground">
            Este número é honesto: tenants legados ou sem assinatura v2 aparecem aqui, sem simular MRR ou cobrança.
          </p>
        </div>
      </Panel>
    </div>
  );
}

