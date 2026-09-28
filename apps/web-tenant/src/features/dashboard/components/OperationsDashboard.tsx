import type { ComponentType, SVGProps } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Banknote,
  CheckCircle2, ChefHat, Copy, ExternalLink, PackageCheck, ReceiptText,
  RefreshCw, ShoppingBag, Store, Truck, UtensilsCrossed, XCircle,
} from 'lucide-react';
import type { DashboardStatsDTO } from '@gestor/types';
import {
  calculateComparison, channelLabel, formatHour, getOperationalSteps,
  type MetricComparison, type StoreOperationalStatus,
} from '../dashboard.utils';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type Props = {
  current: DashboardStatsDTO | null;
  previous: DashboardStatsDTO | null;
  storeStatus: StoreOperationalStatus;
  tenantSlug?: string;
  tenantName?: string;
  billingWarning?: string | null;
  onCopyMenu: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  periodLabel: string;
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const number = (value: number) => value.toLocaleString('pt-BR');

function Comparison({ value, inverse = false }: { value: MetricComparison; inverse?: boolean }) {
  if (!value) return <span className="text-[11px] text-muted-foreground">Comparação indisponível</span>;
  const positive = inverse ? value.direction === 'down' : value.direction === 'up';
  const Icon = value.direction === 'flat' ? ArrowRight : value.direction === 'up' ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${value.direction === 'flat' ? 'text-muted-foreground' : positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {value.percentage.toFixed(1)}% vs. período anterior
    </span>
  );
}

function Kpi({
  icon: Icon, label, value, comparison, inverse, accent,
}: { icon: Icon; label: string; value: string; comparison: MetricComparison; inverse?: boolean; accent: string }) {
  return (
    <article className="group relative min-w-0 overflow-hidden rounded-xl border border-border bg-card px-4 py-3.5 shadow-card transition hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover">
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${accent} to-transparent opacity-80`} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <span className="rounded-lg border border-border bg-secondary p-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 truncate text-xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
      <div className="mt-1.5"><Comparison value={comparison} inverse={inverse} /></div>
    </article>
  );
}

const statusCopy: Record<StoreOperationalStatus, { label: string; detail: string; tone: string }> = {
  open: { label: 'Loja aberta', detail: 'Recebendo pedidos agora', tone: 'bg-emerald-500' },
  paused: { label: 'Operação pausada', detail: 'Pedidos temporariamente suspensos', tone: 'bg-amber-500' },
  closed: { label: 'Loja fechada', detail: 'Fora do horário configurado', tone: 'bg-rose-500' },
};

const flowTone: Record<string, string> = {
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  slate: 'bg-slate-500',
};

function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-border bg-card shadow-card ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export function OperationsDashboard({
  current, previous, storeStatus, tenantSlug, tenantName, billingWarning, onCopyMenu, onRefresh, refreshing,
  periodLabel,
}: Props) {
  const total = current?.operational.totalOrders ?? 0;
  const completedRevenue = current?.commercial.totalRevenue ?? 0;
  const averageTicket = current?.commercial.averageTicket ?? 0;
  const cancellationRate = current?.operational.cancellationRate ?? 0;
  const preparation = current?.operational.averagePreparationTimeMinutes ?? 0;
  const pending = current?.operational.ordersByStatus.pending ?? 0;
  const flow = getOperationalSteps(current);
  const channels = Object.entries(current?.operational.ordersByChannel ?? {}).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  const products = current?.commercial.topProducts ?? [];
  const peakHours = current?.operational.peakHours ?? [];
  const maxPeak = Math.max(...peakHours.map((item) => item.count), 1);
  const deliveryOrders = current?.operational.ordersByFulfillment.delivery ?? 0;
  const topPeak = [...peakHours].sort((a, b) => b.count - a.count)[0];
  const status = statusCopy[storeStatus];

  const kpis = [
    { label: 'Pedidos', value: number(total), icon: ShoppingBag, comparison: calculateComparison(total, previous?.operational.totalOrders), accent: 'via-sky-500' },
    { label: 'Receita concluída', value: money(completedRevenue), icon: Banknote, comparison: calculateComparison(completedRevenue, previous?.commercial.totalRevenue), accent: 'via-emerald-500' },
    { label: 'Ticket concluído', value: money(averageTicket), icon: ReceiptText, comparison: calculateComparison(averageTicket, previous?.commercial.averageTicket), accent: 'via-indigo-500' },
    { label: 'Cancelamentos', value: `${cancellationRate.toFixed(1)}%`, icon: XCircle, comparison: calculateComparison(cancellationRate, previous?.operational.cancellationRate), inverse: true, accent: 'via-rose-500' },
    { label: 'Preparo médio', value: `${Math.round(preparation)} min`, icon: ChefHat, comparison: calculateComparison(preparation, previous?.operational.averagePreparationTimeMinutes), inverse: true, accent: 'via-amber-500' },
  ];

  return (
    <div className="space-y-4">
      {billingWarning ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{billingWarning}</p>
          <Link to="/billing" className="shrink-0 font-semibold underline-offset-4 hover:underline">Ver cobrança</Link>
        </div>
      ) : null}

      <section aria-label="Agora" className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-900 shadow-card dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 sm:px-5">
        <div className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/15" />
        <p className="relative mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Agora</p>
        <div className="relative grid items-center gap-4 lg:grid-cols-[1.2fr_auto_1fr]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <Store className="h-5 w-5 text-slate-700 dark:text-slate-200" aria-hidden="true" />
              <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-900 ${status.tone}`} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{status.label}</p>
              <p className="truncate text-xs text-slate-600 dark:text-slate-400">{status.detail}</p>
            </div>
          </div>
          <div className="hidden h-9 w-px bg-slate-200 dark:bg-slate-700 lg:block" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Pedidos aguardando ação</p>
              <p className={`mt-1 text-base font-bold tabular-nums ${pending > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{pending} <span className="text-xs font-medium text-slate-600 dark:text-slate-400">aguardando</span></p>
            </div>
            <Link to={pending > 0 ? '/orders' : storeStatus === 'open' ? '/orders' : '/settings'} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-indigo-400 dark:hover:bg-indigo-500/15 dark:focus:ring-indigo-400 dark:focus:ring-offset-slate-900 sm:col-span-1">
              {pending > 0 ? 'Ver fila' : storeStatus === 'open' ? 'Ver pedidos' : 'Ajustar operação'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((item) => <Kpi key={item.label} {...item} />)}
      </div>

      {total === 0 ? (
        <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-dashed border-indigo-400/40 bg-indigo-500/[0.04] px-5 py-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-bold text-foreground">Nenhum pedido recebido {periodLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">Compartilhe seu cardápio para começar a movimentar a operação.</p>
          </div>
          {tenantSlug ? (
            <button onClick={onCopyMenu} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring">
              <Copy className="h-3.5 w-3.5" /> Copiar link do cardápio
            </button>
          ) : <Link to="/catalog/products" className="text-xs font-bold text-primary hover:underline">Adicionar produto</Link>}
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
        <Panel title="Fluxo operacional" subtitle={`Distribuição real dos pedidos recebidos ${periodLabel}`}>
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
            {flow.map((step) => (
              <Link key={step.key} to="/orders" className="group bg-card px-3 py-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">{step.label}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </div>
                <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{step.count}</p>
                <div className="mt-2 h-1 overflow-hidden rounded bg-secondary">
                  <div className={`h-full rounded ${flowTone[step.tone]}`} style={{ width: `${step.share}%` }} />
                </div>
                <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">{step.share.toFixed(0)}% do fluxo</p>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel title="Pedidos aguardando ação" subtitle="Pedidos pendentes que exigem aceite">
          <div className="divide-y divide-border px-4">
            {pending > 0 ? (
              <Link to="/orders" className="flex items-center gap-3 py-3.5">
                <span className="rounded-lg bg-amber-500/10 p-2 text-amber-600"><AlertTriangle className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="text-xs font-bold text-foreground">{pending} pedido{pending === 1 ? '' : 's'} aguardando aceite</p><p className="text-[11px] text-muted-foreground">Revise a fila de entrada.</p></div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ) : null}
            {pending === 0 ? (
              <div className="flex items-center gap-3 py-5">
                <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></span>
                <div><p className="text-xs font-bold text-foreground">Nenhum pedido aguardando ação</p><p className="text-[11px] text-muted-foreground">Este painel acompanha apenas pedidos pendentes.</p></div>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pedidos por canal" subtitle={`Origem dos pedidos ${periodLabel}`}>
          <div className="space-y-3 p-4">
            {channels.length > 0 ? channels.map(([channel, count]) => (
              <div key={channel}>
                <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-foreground">{channelLabel(channel)}</span><span className="tabular-nums text-muted-foreground">{count}</span></div>
                <div className="mt-1.5 h-1.5 rounded bg-secondary"><div className="h-full rounded bg-indigo-500" style={{ width: `${(count / total) * 100}%` }} /></div>
              </div>
            )) : <p className="py-8 text-center text-xs text-muted-foreground">Nenhum canal ativo no período.</p>}
          </div>
        </Panel>

        <Panel title="Cozinha" subtitle="Tempos reais, sem estimativa de SLA">
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="rounded-xl bg-secondary/60 p-3"><ChefHat className="h-4 w-4 text-indigo-500" /><p className="mt-3 text-xl font-bold tabular-nums">{Math.round(preparation)} min</p><p className="text-[11px] text-muted-foreground">Preparo médio</p></div>
            <div className="rounded-xl bg-secondary/60 p-3"><UtensilsCrossed className="h-4 w-4 text-amber-500" /><p className="mt-3 text-xl font-bold tabular-nums">{flow.find((item) => item.key === 'preparing')?.count ?? 0}</p><p className="text-[11px] text-muted-foreground">Na cozinha</p></div>
            <div className="col-span-2 flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"><span className="text-muted-foreground">Prontos para saída</span><strong className="tabular-nums">{flow.find((item) => item.key === 'ready')?.count ?? 0}</strong></div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.1fr_1.2fr_0.75fr]">
        <Panel title="Produtos em destaque" subtitle="Ranking por quantidade concluída">
          <div className="space-y-3 p-4">
            {products.length > 0 ? products.slice(0, 5).map((product, index) => {
              const max = Math.max(products[0]?.quantity ?? 1, 1);
              return (
                <div key={product.id} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-2">
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0"><p className="truncate text-xs font-semibold text-foreground">{product.name}</p><div className="mt-1 h-1 rounded bg-secondary"><div className="h-full rounded bg-emerald-500" style={{ width: `${(product.quantity / max) * 100}%` }} /></div></div>
                  <span className="text-xs tabular-nums text-muted-foreground">{product.quantity}</span>
                </div>
              );
            }) : <p className="py-8 text-center text-xs text-muted-foreground">Os produtos aparecerão após pedidos concluídos.</p>}
          </div>
        </Panel>

        <Panel title="Horários de pico" subtitle={topPeak ? `Maior movimento às ${formatHour(topPeak.hour)}, com ${topPeak.count} pedidos` : 'Sem histórico no período'}>
          <div className="flex h-40 items-end gap-1.5 px-4 pb-4 pt-6" role="img" aria-label={topPeak ? `Distribuição de pedidos por hora. Pico às ${formatHour(topPeak.hour)} com ${topPeak.count} pedidos.` : 'Nenhum pedido por hora disponível.'}>
            {peakHours.length > 0 ? peakHours.map((item) => (
              <div key={item.hour} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                <span className="mb-1 hidden text-center text-[9px] tabular-nums text-muted-foreground group-hover:block">{item.count}</span>
                <div className="min-h-[2px] rounded-t bg-gradient-to-t from-indigo-600 to-sky-400" style={{ height: `${Math.max((item.count / maxPeak) * 100, 2)}%` }} />
                <span className="mt-1 truncate text-center text-[8px] text-muted-foreground">{formatHour(item.hour)}</span>
              </div>
            )) : <div className="m-auto text-xs text-muted-foreground">A curva surgirá quando houver pedidos.</div>}
          </div>
        </Panel>

        {deliveryOrders > 0 ? (
          <Panel title="Delivery" subtitle="Resumo do canal de entrega">
            <div className="p-4">
              <Truck className="h-5 w-5 text-sky-500" />
              <p className="mt-4 text-2xl font-bold tabular-nums">{deliveryOrders}</p>
              <p className="text-[11px] text-muted-foreground">pedidos para entrega</p>
              <div className="mt-4 border-t border-border pt-3"><p className="text-xs font-semibold">{Math.round(current?.operational.averageDeliveryTimeMinutes ?? 0)} min</p><p className="text-[11px] text-muted-foreground">tempo médio de entrega</p></div>
            </div>
          </Panel>
        ) : (
          <Panel title="Ações rápidas" subtitle={tenantName ? `Atalhos de ${tenantName}` : 'Atalhos da operação'}>
            <nav className="grid grid-cols-2 gap-2 p-4" aria-label="Ações rápidas">
              {[
                ['/orders', 'Pedidos', ShoppingBag],
                ['/cash', 'Caixa', Banknote],
                ['/catalog/products', 'Produtos', PackageCheck],
                ['/settings', 'Ajustes', Store],
              ].map(([to, label, ItemIcon]) => (
                <Link key={String(to)} to={String(to)} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-semibold hover:border-primary/40">
                  <ItemIcon className="h-3.5 w-3.5 text-primary" /> {String(label)}
                </Link>
              ))}
              {tenantSlug ? <button onClick={onCopyMenu} className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-primary/40"><ExternalLink className="h-3.5 w-3.5" /> Compartilhar cardápio</button> : null}
            </nav>
          </Panel>
        )}
      </div>

      <button onClick={onRefresh} disabled={refreshing} className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50">
        <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar visão geral
      </button>
    </div>
  );
}
