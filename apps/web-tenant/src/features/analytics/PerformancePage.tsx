import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  Filter,
  Layers3,
  MousePointerClick,
  Package,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import type {
  AnalyticsAcquisitionResponse,
  AnalyticsFunnelResponse,
  AnalyticsMetricDelta,
  AnalyticsOverviewResponse,
  AnalyticsProductsResponse,
} from '@gestor/types';
import { api } from '../../lib/api-client';
import { Badge, Button, Card, PageHeader } from '../../components/ui';

const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUMBER = new Intl.NumberFormat('pt-BR');
const PERCENT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

type EndpointResponse<T> = { success?: boolean; data?: T } | T;

function unwrap<T>(response: EndpointResponse<T>): T {
  if (typeof response === 'object' && response !== null && 'data' in response && response.data !== undefined) {
    return response.data;
  }
  return response as T;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatValue(value: number, kind: 'number' | 'currency' | 'percent' = 'number'): string {
  if (kind === 'currency') return CURRENCY.format(value);
  if (kind === 'percent') return `${PERCENT.format(value * 100)}%`;
  return NUMBER.format(value);
}

function Delta({ delta }: { delta: AnalyticsMetricDelta | undefined }) {
  if (!delta) return <span className="text-xs text-muted-foreground">Sem comparação</span>;
  const positive = delta.direction === 'up';
  const flat = delta.direction === 'flat';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${flat ? 'text-muted-foreground' : positive ? 'text-status-success' : 'text-status-danger'}`}>
      {flat ? '•' : positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {delta.percentage === null ? 'Novo período' : `${Math.abs(delta.percentage).toFixed(1)}%`}
    </span>
  );
}

const KPI_DEFS: Array<{ key: keyof AnalyticsOverviewResponse['current']; label: string; icon: typeof Users; kind?: 'currency' | 'percent' }> = [
  { key: 'sessions', label: 'Sessões', icon: Users },
  { key: 'menuViews', label: 'Visitas ao cardápio', icon: Eye },
  { key: 'addToCart', label: 'Adições ao carrinho', icon: ShoppingCart },
  { key: 'checkoutStarted', label: 'Checkouts iniciados', icon: MousePointerClick },
  { key: 'ordersSubmitted', label: 'Pedidos enviados', icon: Package },
  { key: 'ordersConfirmed', label: 'Pedidos confirmados', icon: Sparkles },
  { key: 'ordersCompleted', label: 'Pedidos concluídos', icon: TrendingUp },
  { key: 'ordersCancelled', label: 'Cancelamentos', icon: CircleAlert },
  { key: 'storefrontConversionRate', label: 'Conversão da vitrine', icon: TrendingUp, kind: 'percent' },
  { key: 'acceptanceRate', label: 'Taxa de aceite', icon: Filter, kind: 'percent' },
  { key: 'completionRate', label: 'Taxa de conclusão', icon: BarChart3, kind: 'percent' },
  { key: 'realizedRevenue', label: 'Receita realizada', icon: Sparkles, kind: 'currency' },
  { key: 'averageOrderValue', label: 'Ticket médio', icon: TrendingUp, kind: 'currency' },
];

const FUNNEL_LABELS: Record<string, string> = {
  menu_viewed: 'Cardápio visualizado',
  product_viewed: 'Produto visualizado',
  add_to_cart: 'Adição ao carrinho',
  checkout_started: 'Checkout iniciado',
  order_submitted: 'Pedido enviado',
  order_completed: 'Pedido concluído',
};

export function PerformancePage() {
  const initialTo = new Date();
  const initialFrom = new Date(initialTo);
  initialFrom.setDate(initialFrom.getDate() - 29);
  const [from, setFrom] = useState(dateString(initialFrom));
  const [to, setTo] = useState(dateString(initialTo));
  const [compare, setCompare] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<'views' | 'addToCart' | 'ordersCompleted' | 'quantityCompleted' | 'realizedRevenue'>('realizedRevenue');
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&compare=${compare ? 'true' : 'false'}`;

  const overview = useQuery({ queryKey: ['analytics-performance-overview', query], queryFn: async () => unwrap(await api.get<AnalyticsOverviewResponse>(`/analytics/performance/overview?${query}`)) });
  const funnel = useQuery({ queryKey: ['analytics-performance-funnel', query], queryFn: async () => unwrap(await api.get<AnalyticsFunnelResponse>(`/analytics/performance/funnel?${query}`)) });
  const products = useQuery({ queryKey: ['analytics-performance-products', query, page, sort], queryFn: async () => unwrap(await api.get<AnalyticsProductsResponse>(`/analytics/performance/products?${query}&limit=10&page=${page}&sort=${sort}`)) });
  const acquisition = useQuery({ queryKey: ['analytics-performance-acquisition', query], queryFn: async () => unwrap(await api.get<AnalyticsAcquisitionResponse>(`/analytics/performance/acquisition?${query}&limit=10&page=1&sort=ordersCompleted`)) });
  const loading = overview.isLoading || funnel.isLoading || products.isLoading || acquisition.isLoading;
  const error = overview.isError || funnel.isError || products.isError || acquisition.isError;
  const hasData = (overview.data?.current.sessions ?? 0) > 0 || (products.data?.current.items.length ?? 0) > 0;
  const periodLabel = overview.data?.period ? `${overview.data.period.from} — ${overview.data.period.to}` : `${from} — ${to}`;
  const productPages = products.data?.current;
  const totalPages = productPages ? Math.max(1, Math.ceil(productPages.total / productPages.limit)) : 1;
  const refresh = () => { void Promise.all([overview.refetch(), funnel.refetch(), products.refetch(), acquisition.refetch()]); };
  const dateRangeValid = useMemo(() => from <= to, [from, to]);

  return (
    <main className="min-h-full bg-background p-4 sm:p-6 lg:p-8">
      <PageHeader title="Desempenho" description="Uma leitura operacional do comportamento da sua vitrine e dos pedidos realizados." icon={BarChart3} action={<Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Atualizar</Button>} />

      <section className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-muted-foreground">De<input aria-label="Data inicial" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-input bg-input-bg px-3 py-2 text-sm text-foreground" /></label>
          <label className="text-xs font-medium text-muted-foreground">Até<input aria-label="Data final" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-input bg-input-bg px-3 py-2 text-sm text-foreground" /></label>
          <label className="flex items-center gap-2 pb-2 text-sm text-foreground"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-4 w-4 accent-primary" /> Comparar período anterior</label>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays size={15} /> {periodLabel} <Badge variant="info" size="sm">{overview.data?.period.timezone ?? 'Timezone da loja'}</Badge></div>
      </section>
      {!dateRangeValid && <div className="mb-6 rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">A data inicial precisa ser anterior ou igual à data final.</div>}
      {error && <div className="mb-6 flex items-center justify-between rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">Não foi possível carregar todos os dados de desempenho.<Button variant="outline" size="sm" onClick={refresh}>Tentar novamente</Button></div>}
      {loading && !overview.data ? <LoadingState /> : !hasData && !error ? <EmptyState /> : (
        <>
          <section aria-label="Indicadores principais" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {KPI_DEFS.map(({ key, label, icon: Icon, kind }) => {
              const value = overview.data?.current[key];
              const numeric = typeof value === 'number' ? value : 0;
              return <Card key={key} className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{formatValue(numeric, kind)}</p></div><span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon size={17} /></span></div><div className="mt-3"><Delta delta={overview.data?.delta?.[key]} /></div></Card>;
            })}
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
            <Card className="overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold text-foreground">Funil de conversão</h2><p className="mt-1 text-xs text-muted-foreground">Contagens reais por etapa; a ordem pode não ser monotônica.</p></div><div className="divide-y divide-border">{(funnel.data?.current ?? []).map((step, index) => <div key={step.eventName} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{String(index + 1).padStart(2, '0')}</span><div><p className="text-sm font-medium text-foreground">{FUNNEL_LABELS[step.eventName] ?? step.eventName}</p><p className="text-xs text-muted-foreground">{NUMBER.format(step.uniqueSessions)} sessões únicas</p></div></div><div className="text-right"><p className="text-sm font-semibold text-foreground">{NUMBER.format(step.eventCount)}</p><p className="text-[11px] text-muted-foreground">eventos</p></div><div className="min-w-[92px] text-right"><p className="text-sm font-medium text-foreground">{formatValue(step.conversionFromStart, 'percent')}</p><p className="text-[11px] text-muted-foreground">desde o início</p></div></div>)}</div></Card>
            <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold text-foreground">Aquisição</h2><p className="mt-1 text-xs text-muted-foreground">Origem do tráfego materializada nos eventos.</p></div><div className="m-4 rounded-lg border border-status-warning/30 bg-status-warning/10 p-3"><p className="text-sm font-semibold text-foreground">Cobertura parcial · somente tráfego com UTM</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Direct/unknown ainda não está disponível. Receita por canal também não está atribuída.</p></div><div className="overflow-x-auto px-4 pb-4"><table className="w-full text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-2 font-medium">Dimensão</th><th className="pb-2 text-right font-medium">Sessões</th><th className="pb-2 text-right font-medium">Pedidos</th><th className="pb-2 text-right font-medium">Receita</th></tr></thead><tbody className="divide-y divide-border">{(acquisition.data?.current.items ?? []).map((row) => <tr key={`${row.dimensionType}-${row.dimensionKey}`}><td className="py-3"><span className="text-xs uppercase tracking-wide text-muted-foreground">{row.dimensionType.replace('utm_', '')}</span><p className="font-medium text-foreground">{row.dimensionKey}</p></td><td className="py-3 text-right text-foreground">{NUMBER.format(row.sessions)}</td><td className="py-3 text-right text-foreground">{NUMBER.format(row.ordersCompleted)}</td><td className="py-3 text-right text-xs text-muted-foreground">Indisponível</td></tr>)}</tbody></table>{(acquisition.data?.current.items.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma campanha com UTM no período.</p>}</div></Card>
          </section>

          <section className="mt-6"><Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-foreground">Produtos em destaque</h2><p className="mt-1 text-xs text-muted-foreground">Receita e quantidade concluída vêm dos pedidos autoritativos.</p></div><label className="flex items-center gap-2 text-xs text-muted-foreground">Ordenar por<select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} className="rounded-lg border border-input bg-input-bg px-2 py-1.5 text-xs text-foreground"><option value="realizedRevenue">Receita</option><option value="ordersCompleted">Pedidos concluídos</option><option value="quantityCompleted">Quantidade</option><option value="views">Visualizações</option><option value="addToCart">Adições ao carrinho</option></select></label></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Produto', 'Views', 'Seleções', 'Carrinho', 'Pedidos concluídos', 'Qtd.', 'Receita'].map((header) => <th key={header} className="px-5 py-3 font-medium">{header}</th>)}</tr></thead><tbody className="divide-y divide-border">{(productPages?.items ?? []).map((product) => <tr key={product.productId} className="transition-colors hover:bg-muted/40"><td className="px-5 py-3"><p className="font-medium text-foreground">{product.productName}</p><p className="text-xs text-muted-foreground">{product.categoryName ?? 'Sem categoria'}</p></td><td className="px-5 py-3 text-foreground">{NUMBER.format(product.views)}</td><td className="px-5 py-3 text-foreground">{NUMBER.format(product.selections)}</td><td className="px-5 py-3 text-foreground">{NUMBER.format(product.addToCart)}</td><td className="px-5 py-3 text-foreground">{NUMBER.format(product.ordersCompleted)}</td><td className="px-5 py-3 text-foreground">{NUMBER.format(product.quantityCompleted)}</td><td className="px-5 py-3 font-medium text-foreground">{CURRENCY.format(product.realizedRevenue)}</td></tr>)}</tbody></table>{(productPages?.items.length ?? 0) === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum produto com atividade no período.</p>}</div><div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>{productPages ? `${productPages.total} produtos` : '—'}</span><div className="flex items-center gap-2"><button aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronLeft size={15} /></button><span>Página {page} de {totalPages}</span><button aria-label="Próxima página" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronRight size={15} /></button></div></div></Card></section>
        </>
      )}
    </main>
  );
}

function LoadingState() { return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-border bg-card" />)}</div>; }
function EmptyState() { return <Card className="p-12 text-center"><Layers3 className="mx-auto text-muted-foreground" size={32} /><h2 className="mt-4 text-lg font-semibold text-foreground">Ainda não há dados de desempenho</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Assim que sua vitrine receber visitas e pedidos, os indicadores aparecerão aqui.</p></Card>; }
