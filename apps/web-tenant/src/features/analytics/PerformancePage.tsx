import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Layers3,
} from 'lucide-react';
import type {
  AnalyticsAcquisitionResponse,
  AnalyticsFunnelResponse,
  AnalyticsProductsResponse,
} from '@gestor/types';
import { api } from '../../lib/api-client';
import { Button, Card } from '../../components/ui';

const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUMBER = new Intl.NumberFormat('pt-BR');
const PERCENT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

type EndpointResponse<T> = { success?: boolean; data?: T } | T;
type ProductSort = 'views' | 'addToCart' | 'ordersCompleted' | 'quantityCompleted' | 'realizedRevenue';

export interface PerformanceInsightsProps {
  from: string;
  to: string;
  compare: boolean;
}

function unwrap<T>(response: EndpointResponse<T>): T {
  if (typeof response === 'object' && response !== null && 'data' in response && response.data !== undefined) {
    return response.data;
  }
  return response as T;
}

function formatValue(value: number, kind: 'number' | 'currency' | 'percent' = 'number'): string {
  if (kind === 'currency') return CURRENCY.format(value);
  if (kind === 'percent') return `${PERCENT.format(value * 100)}%`;
  return NUMBER.format(value);
}

const FUNNEL_LABELS: Record<string, string> = {
  menu_viewed: 'Cardápio visualizado', product_viewed: 'Produto visualizado', add_to_cart: 'Adição ao carrinho', checkout_started: 'Checkout iniciado', order_submitted: 'Pedido enviado', order_completed: 'Pedido concluído',
};

/** Historical detail used by the Desempenho tab. The Reports shell owns the shared filters. */
export function PerformanceInsights({ from, to, compare }: PerformanceInsightsProps) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ProductSort>('realizedRevenue');
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&compare=${compare ? 'true' : 'false'}`;
  const dateRangeValid = useMemo(() => from <= to, [from, to]);
  useEffect(() => { setPage(1); }, [from, to, compare]);
  const funnel = useQuery({ queryKey: ['analytics-performance-funnel', query], enabled: dateRangeValid, queryFn: async () => unwrap(await api.get<AnalyticsFunnelResponse>(`/analytics/performance/funnel?${query}`)) });
  const products = useQuery({ queryKey: ['analytics-performance-products', query, page, sort], enabled: dateRangeValid, queryFn: async () => unwrap(await api.get<AnalyticsProductsResponse>(`/analytics/performance/products?${query}&limit=10&page=${page}&sort=${sort}`)) });
  const acquisition = useQuery({ queryKey: ['analytics-performance-acquisition', query], enabled: dateRangeValid, queryFn: async () => unwrap(await api.get<AnalyticsAcquisitionResponse>(`/analytics/performance/acquisition?${query}&limit=10&page=1&sort=ordersCompleted`)) });
  const loading = funnel.isLoading || products.isLoading || acquisition.isLoading;
  const error = funnel.isError || products.isError || acquisition.isError;
  const hasData = (funnel.data?.current.length ?? 0) > 0 || (products.data?.current.items.length ?? 0) > 0 || (acquisition.data?.current.items.length ?? 0) > 0;
  const productPages = products.data?.current;
  const totalPages = productPages ? Math.max(1, Math.ceil(productPages.total / productPages.limit)) : 1;
  const refresh = () => { void Promise.all([funnel.refetch(), products.refetch(), acquisition.refetch()]); };

  if (!dateRangeValid) return <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">A data inicial precisa ser anterior ou igual à data final.</div>;
  if (error) return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">Não foi possível carregar todos os dados de desempenho.<Button variant="outline" size="sm" onClick={refresh}>Tentar novamente</Button></div>;
  if (loading && !funnel.data && !products.data && !acquisition.data) return <LoadingState />;
  if (!hasData) return <EmptyState />;

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold text-foreground">Funil de conversão</h2><p className="mt-1 text-xs text-muted-foreground">Contagens reais por etapa; a ordem pode não ser monotônica.</p></div><div className="divide-y divide-border">{(funnel.data?.current ?? []).map((step, index) => <div key={step.eventName} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-4 sm:grid-cols-[1fr_auto_auto] sm:px-5"><div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{String(index + 1).padStart(2, '0')}</span><div><p className="text-sm font-medium text-foreground">{FUNNEL_LABELS[step.eventName] ?? step.eventName}</p><p className="text-xs text-muted-foreground">{NUMBER.format(step.uniqueSessions)} sessões únicas</p></div></div><div className="text-right"><p className="text-sm font-semibold text-foreground">{NUMBER.format(step.eventCount)}</p><p className="text-[11px] text-muted-foreground">eventos</p></div><div className="hidden min-w-[92px] text-right sm:block"><p className="text-sm font-medium text-foreground">{formatValue(step.conversionFromStart, 'percent')}</p><p className="text-[11px] text-muted-foreground">desde o início</p></div></div>)}</div></Card>
        <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold text-foreground">Aquisição</h2><p className="mt-1 text-xs text-muted-foreground">Origem do tráfego materializada nos eventos.</p></div><div className="m-4 rounded-lg border border-status-warning/30 bg-status-warning/10 p-3"><p className="text-sm font-semibold text-foreground">Cobertura parcial · somente tráfego com UTM</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Direct/unknown ainda não está disponível. Receita por canal também não está atribuída.</p></div><div className="overflow-x-auto px-4 pb-4"><table className="w-full min-w-[380px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-2 font-medium">Dimensão</th><th className="pb-2 text-right font-medium">Sessões</th><th className="pb-2 text-right font-medium">Pedidos</th></tr></thead><tbody className="divide-y divide-border">{(acquisition.data?.current.items ?? []).map((row) => <tr key={`${row.dimensionType}-${row.dimensionKey}`}><td className="py-3"><span className="text-xs uppercase tracking-wide text-muted-foreground">{row.dimensionType.replace('utm_', '')}</span><p className="font-medium text-foreground">{row.dimensionKey}</p></td><td className="py-3 text-right text-foreground">{NUMBER.format(row.sessions)}</td><td className="py-3 text-right text-foreground">{NUMBER.format(row.ordersCompleted)}</td></tr>)}</tbody></table>{(acquisition.data?.current.items.length ?? 0) === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma campanha com UTM no período.</p>}</div></Card>
      </section>
      <Card className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-foreground">Produtos em destaque</h2><p className="mt-1 text-xs text-muted-foreground">Receita e quantidade concluída vêm dos pedidos autoritativos.</p></div><label className="flex items-center gap-2 text-xs text-muted-foreground">Ordenar por<select value={sort} onChange={(event) => { setSort(event.target.value as ProductSort); setPage(1); }} className="rounded-lg border border-input bg-input-bg px-2 py-1.5 text-xs text-foreground"><option value="realizedRevenue">Receita</option><option value="ordersCompleted">Pedidos concluídos</option><option value="quantityCompleted">Quantidade</option><option value="views">Visualizações</option><option value="addToCart">Adições ao carrinho</option></select></label></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Produto', 'Views', 'Carrinho', 'Pedidos concluídos', 'Qtd.', 'Receita'].map((header) => <th key={header} className="px-5 py-3 font-medium">{header}</th>)}</tr></thead><tbody className="divide-y divide-border">{(productPages?.items ?? []).map((product) => <tr key={product.productId} className="transition-colors hover:bg-muted/40"><td className="px-5 py-3"><p className="font-medium text-foreground">{product.productName}</p><p className="text-xs text-muted-foreground">{product.categoryName ?? 'Sem categoria'}</p></td><td className="px-5 py-3 text-foreground">{NUMBER.format(product.views)}</td><td className="px-5 py-3 text-foreground">{NUMBER.format(product.addToCart)}</td><td className="px-5 py-3 text-foreground">{NUMBER.format(product.ordersCompleted)}</td><td className="px-5 py-3 text-foreground">{NUMBER.format(product.quantityCompleted)}</td><td className="px-5 py-3 font-medium text-foreground">{CURRENCY.format(product.realizedRevenue)}</td></tr>)}</tbody></table>{(productPages?.items.length ?? 0) === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum produto com atividade no período.</p>}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>{productPages ? `${productPages.total} produtos` : '—'}</span><div className="flex items-center gap-2"><button aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronLeft size={15} /></button><span>Página {page} de {totalPages}</span><button aria-label="Próxima página" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-md border border-border p-1.5 disabled:opacity-40"><ChevronRight size={15} /></button></div></div></Card>
    </div>
  );
}

function LoadingState() { return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-border bg-card" />)}</div>; }
function EmptyState() { return <Card className="p-12 text-center"><Layers3 className="mx-auto text-muted-foreground" size={32} /><h2 className="mt-4 text-lg font-semibold text-foreground">Ainda não há dados de desempenho</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Assim que sua vitrine receber visitas e pedidos, os indicadores aparecerão aqui.</p></Card>; }
