import type { ComponentType, ReactNode, SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, ReceiptText, ShoppingBag, Store, XCircle } from 'lucide-react';
import type { DashboardStatsDTO } from '@gestor/types';
import { getOperationalSteps, type StoreOperationalStatus } from '../dashboard.utils';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type Props = { current: DashboardStatsDTO | null; storeStatus: StoreOperationalStatus; billingWarning?: string | null; analyticsAvailable: boolean; canOpenReports: boolean };

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const number = (value: number) => value.toLocaleString('pt-BR');
const statusCopy: Record<StoreOperationalStatus, { label: string; detail: string; tone: string }> = {
  open: { label: 'Loja aberta', detail: 'Recebendo pedidos agora', tone: 'bg-emerald-500' },
  paused: { label: 'Operação pausada', detail: 'Pedidos temporariamente suspensos', tone: 'bg-amber-500' },
  closed: { label: 'Loja fechada', detail: 'Fora do horário configurado', tone: 'bg-rose-500' },
};
const flowTone: Record<string, string> = { sky: 'bg-sky-500', amber: 'bg-amber-500', indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', slate: 'bg-slate-500' };

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-border bg-card shadow-card"><header className="border-b border-border px-4 py-3.5"><h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>{subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}</header>{children}</section>;
}

function Kpi({ icon: Icon, label, value, hint }: { icon: Icon; label: string; value: string; hint?: string }) {
  return <article className="min-w-0 rounded-xl border border-border bg-card px-4 py-3.5 shadow-card"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{label}</span><span className="rounded-lg border border-border bg-secondary p-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span></div><p className="mt-2 truncate text-xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>{hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}</article>;
}

export function OperationsDashboard({ current, storeStatus, billingWarning, analyticsAvailable, canOpenReports }: Props) {
  const status = statusCopy[storeStatus];
  const pending = current?.operational.ordersByStatus.pending ?? 0;
  const flow = getOperationalSteps(current);
  const completedOrders = current?.commercial.totalOrders ?? 0;
  const completedRevenue = current?.commercial.totalRevenue ?? 0;
  const averageTicket = current?.commercial.averageTicket ?? 0;
  const cancellationRate = current?.operational.cancellationRate ?? 0;

  return <div className="space-y-4">
    {billingWarning ? <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p className="min-w-0 flex-1">{billingWarning}</p><Link to="/billing" className="shrink-0 font-semibold underline-offset-4 hover:underline">Ver financeiro</Link></div> : null}

    {!analyticsAvailable ? <section className="rounded-2xl border border-border bg-card px-5 py-5 shadow-card"><h2 className="text-sm font-bold text-foreground">Painel operacional disponível</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">O acompanhamento de vendas e métricas depende da permissão de Relatórios.</p><Link to="/orders" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline">Abrir pedidos <ArrowRight className="h-3.5 w-3.5" /></Link></section> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Vendas concluídas" value={money(completedRevenue)} hint="Valor dos pedidos concluídos" icon={Banknote} /><Kpi label="Pedidos concluídos" value={number(completedOrders)} icon={ShoppingBag} /><Kpi label="Ticket médio" value={money(averageTicket)} hint="Vendas concluídas ÷ pedidos concluídos" icon={ReceiptText} /><Kpi label="Cancelamentos" value={`${cancellationRate.toFixed(1)}%`} icon={XCircle} /></div>
      <div className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]"><Panel title="Fluxo operacional" subtitle="Pedidos que precisam avançar hoje"><div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">{flow.map((step) => <Link key={step.key} to="/orders" className="group bg-card px-3 py-4 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-muted-foreground">{step.label}</span><ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" /></div><p className="mt-2 text-xl font-bold tabular-nums text-foreground">{step.count}</p><div className="mt-2 h-1 overflow-hidden rounded bg-secondary"><div className={`h-full rounded ${flowTone[step.tone]}`} style={{ width: `${step.share}%` }} /></div></Link>)}</div></Panel><Panel title="Pontos de atenção" subtitle="Somente condições que pedem ação"><div className="divide-y divide-border px-4">{pending > 0 ? <Link to="/orders" className="flex items-center gap-3 py-3.5"><span className="rounded-lg bg-amber-500/10 p-2 text-amber-600"><AlertTriangle className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-foreground">{pending} pedido{pending === 1 ? '' : 's'} aguardando aceite</p><p className="text-[11px] text-muted-foreground">Revise a fila de entrada.</p></div><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link> : null}{storeStatus !== 'open' ? <Link to="/settings" className="flex items-center gap-3 py-3.5"><span className="rounded-lg bg-rose-500/10 p-2 text-rose-600"><Store className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-foreground">{status.label}</p><p className="text-[11px] text-muted-foreground">{status.detail}.</p></div><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link> : null}{pending === 0 && storeStatus === 'open' ? <div className="flex items-center gap-3 py-5"><span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></span><div><p className="text-xs font-bold text-foreground">Operação em dia</p><p className="text-[11px] text-muted-foreground">Nenhuma ação imediata identificada.</p></div></div> : null}</div></Panel></div>
      {canOpenReports ? <Link to="/analytics/reports" className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-card transition hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"><span><span className="block">Quer analisar o desempenho?</span><span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">Veja canais, produtos e períodos em Relatórios.</span></span><span className="inline-flex shrink-0 items-center gap-1 text-xs text-primary">Ver relatórios <ArrowRight className="h-3.5 w-3.5" /></span></Link> : null}
    </>}
  </div>;
}
