import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Clock, DollarSign, Package, TrendingUp,
} from 'lucide-react';
import {
  Bar as RechartsBar, BarChart as RechartsBarChart, CartesianGrid, Cell as RechartsCell,
  Legend, Pie as RechartsPie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { DashboardStatsDTO } from '@gestor/types';
import { api } from '../../lib/api-client';
import { Card, PageHeader } from '../../components/ui';
import {
  chartAxisColor, chartGridColor, chartTooltipContentStyle, chartTooltipCursor,
  chartTooltipItemStyle, chartTooltipLabelStyle,
} from '../../components/charts/chart-theme';
import { PerformanceInsights } from './PerformancePage';

type ReportTab = 'overview' | 'performance';

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function dateString(date: Date): string { return date.toISOString().slice(0, 10); }
function toIso(date: string, endOfDay = false): string {
  return new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).toISOString();
}
function isReportTab(value: string | null): value is ReportTab { return value === 'overview' || value === 'performance'; }

export interface ReportsPageProps { initialTab?: ReportTab; }

export function ReportsPage({ initialTab = 'overview' }: ReportsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTo = useMemo(() => new Date(), []);
  const initialFrom = useMemo(() => { const value = new Date(initialTo); value.setDate(value.getDate() - 29); return value; }, [initialTo]);
  const [from, setFrom] = useState(dateString(initialFrom));
  const [to, setTo] = useState(dateString(initialTo));
  const [compare, setCompare] = useState(true);
  const tab = isReportTab(searchParams.get('tab')) ? searchParams.get('tab') : initialTab;
  const dateRangeValid = from <= to;
  const overview = useQuery({
    queryKey: ['analytics-dashboard', from, to],
    enabled: tab === 'overview' && dateRangeValid,
    queryFn: async () => {
      const response = await api.get<DashboardStatsDTO>(`/analytics/dashboard?startDate=${encodeURIComponent(toIso(from))}&endDate=${encodeURIComponent(toIso(to, true))}`);
      if (response.success) return response.data;
      throw new Error('Erro ao carregar dados');
    },
  });

  const selectTab = (next: ReportTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'overview') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  };
  return (
    <main className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <PageHeader title="Relatórios" description="Acompanhe o histórico de vendas, pedidos e desempenho da sua loja." icon={TrendingUp} />

      <section aria-label="Período do relatório" className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-muted-foreground">De<input aria-label="Data inicial" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-input bg-input-bg px-3 py-2 text-sm text-foreground" /></label>
          <label className="text-xs font-medium text-muted-foreground">Até<input aria-label="Data final" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-input bg-input-bg px-3 py-2 text-sm text-foreground" /></label>
          <label className="flex min-h-10 items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} className="h-4 w-4 accent-primary" /> Comparar período anterior</label>
        </div>
        <p className="text-xs text-muted-foreground">Os dados consideram o período selecionado.</p>
      </section>

      <div role="tablist" aria-label="Seções dos relatórios" className="mb-6 flex overflow-x-auto border-b border-border">
        <ReportTabButton active={tab === 'overview'} onClick={() => selectTab('overview')} id="reports-overview-tab" panelId="reports-overview-panel">Visão geral</ReportTabButton>
        <ReportTabButton active={tab === 'performance'} onClick={() => selectTab('performance')} id="reports-performance-tab" panelId="reports-performance-panel">Desempenho</ReportTabButton>
      </div>

      {tab === 'overview' ? <Overview stats={overview.data} loading={overview.isLoading} error={overview.isError} dateRangeValid={dateRangeValid} /> : <section id="reports-performance-panel" role="tabpanel" aria-labelledby="reports-performance-tab"><PerformanceInsights from={from} to={to} compare={compare} /></section>}
    </main>
  );
}

function ReportTabButton({ active, onClick, id, panelId, children }: { active: boolean; onClick: () => void; id: string; panelId: string; children: string }) {
  return <button type="button" role="tab" id={id} aria-selected={active} aria-controls={panelId} onClick={onClick} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{children}</button>;
}

function Overview({ stats, loading, error, dateRangeValid }: { stats: DashboardStatsDTO | undefined; loading: boolean; error: boolean; dateRangeValid: boolean }) {
  if (!dateRangeValid) return <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">A data inicial precisa ser anterior ou igual à data final.</div>;
  if (loading) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-border bg-card" />)}</div>;
  if (error || !stats) return <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-4 text-sm text-status-danger">Não foi possível carregar os relatórios. Tente novamente.</div>;
  const channelData = Object.entries(stats.commercial.revenueByChannel).map(([name, value]) => ({ name, value }));
  return (
    <section id="reports-overview-panel" role="tabpanel" aria-labelledby="reports-overview-tab" className="space-y-6">
      <div aria-label="Indicadores históricos" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Vendas concluídas" value={CURRENCY.format(stats.commercial.totalRevenue)} />
        <MetricCard label="Pedidos concluídos" value={String(stats.commercial.totalOrders)} />
        <MetricCard label="Ticket médio" value={CURRENCY.format(stats.commercial.averageTicket)} />
        <MetricCard label="Cancelamentos" value={`${stats.operational.cancellationRate.toFixed(1)}%`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5"><h2 className="flex items-center gap-2 font-semibold text-foreground"><DollarSign size={18} className="text-primary" /> Vendas por canal</h2><p className="mt-1 text-xs text-muted-foreground">Participação no período selecionado.</p><div className="mt-4 h-[260px]">{channelData.length ? <ResponsiveContainer width="100%" height="100%"><RechartsPieChart><RechartsPie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} labelLine={false}>{channelData.map((_, index) => <RechartsCell key={index} fill={COLORS[index % COLORS.length]} />)}</RechartsPie><Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} itemStyle={chartTooltipItemStyle} /><Legend /></RechartsPieChart></ResponsiveContainer> : <EmptyChart />}</div></Card>
        <Card className="p-5"><h2 className="flex items-center gap-2 font-semibold text-foreground"><Clock size={18} className="text-primary" /> Horários de pico</h2><p className="mt-1 text-xs text-muted-foreground">Volume de pedidos por horário.</p><div className="mt-4 h-[260px]"><ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={stats.operational.peakHours}><CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="hour" stroke={chartAxisColor} tickFormatter={(hour) => `${hour}h`} /><YAxis stroke={chartAxisColor} /><Tooltip contentStyle={chartTooltipContentStyle} cursor={chartTooltipCursor} itemStyle={chartTooltipItemStyle} labelStyle={chartTooltipLabelStyle} formatter={(value) => [`${value} pedidos`, 'Volume']} /><RechartsBar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} /></RechartsBarChart></ResponsiveContainer></div></Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card className="p-5"><h2 className="flex items-center gap-2 font-semibold text-foreground"><Package size={18} className="text-primary" /> Produtos em destaque</h2><div className="mt-4 divide-y divide-border">{stats.commercial.topProducts.length ? stats.commercial.topProducts.map((product, index) => <div key={`${product.name}-${index}`} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{product.name}</p><p className="text-xs text-muted-foreground">{product.quantity} unidades</p></div><p className="shrink-0 text-sm font-semibold text-foreground">{CURRENCY.format(product.revenue)}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">Nenhum produto concluído no período.</p>}</div></Card>
        <Card className="p-5"><h2 className="font-semibold text-foreground">Leitura operacional</h2><dl className="mt-4 divide-y divide-border"><MetricRow label="Tempo médio de preparo" value={`${stats.operational.averagePreparationTimeMinutes.toFixed(1)} min`} /><MetricRow label="Tempo médio de entrega" value={`${stats.operational.averageDeliveryTimeMinutes.toFixed(1)} min`} /></dl></Card>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) { return <Card className="p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p></Card>; }
function MetricRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-sm font-semibold text-foreground">{value}</dd></div>; }
function EmptyChart() { return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Nenhuma venda por canal no período.</div>; }
