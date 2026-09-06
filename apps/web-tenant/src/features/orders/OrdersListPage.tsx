import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Clock3, Package, RefreshCw, Search, ShoppingBag, Truck } from 'lucide-react';
import type { FulfillmentType, OrderDeliveryOwnership, OrderListItemDTO, OrderOrigin, OrderStatus } from '@gestor/types';
import { api, ApiError } from '../../lib/api-client';
import { PageHeader } from '../../components/ui/PageHeader';
import { OrderDrawer } from './components/OrderDrawer';
import { OrderStatusBadge } from './components/OrderStatusBadge';
import { deliveryStatement, providerLabel } from './order-presenters';
import { subscribeOrdersRealtimeEvents } from '../../notifications/ordersRealtimeEvents';
import { OrdersFreshnessStatus } from './components/OrdersFreshnessStatus';
import { useOrdersRealtimeState } from './hooks/useOrdersRealtimeState';

type PeriodFilter = 'today' | 'yesterday' | 'last7' | 'all';

const STATUS_OPTIONS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'pending', label: 'Novos' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'preparing', label: 'Em produção' },
  { value: 'ready_for_pickup', label: 'Prontos para retirada' },
  { value: 'ready_for_delivery', label: 'Prontos para entrega' },
  { value: 'out_for_delivery', label: 'Em rota' },
  { value: 'completed', label: 'Concluídos' },
  { value: 'cancelled', label: 'Cancelados' },
];

const selectClass = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary';

export function OrdersListPage() {
  const [orders, setOrders] = useState<OrderListItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [origin, setOrigin] = useState<OrderOrigin | ''>('');
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [fulfillment, setFulfillment] = useState<FulfillmentType | ''>('');
  const [ownership, setOwnership] = useState<OrderDeliveryOwnership | ''>('');
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [hasPendingUpdates, setHasPendingUpdates] = useState(false);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<number | null>(null);
  const realtime = useOrdersRealtimeState(lastConfirmedAt);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearchQuery(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (origin) params.set('origin', origin);
      if (fulfillment) params.set('fulfillmentType', fulfillment);
      if (ownership) params.set('ownership', ownership);
      if (searchQuery) params.set('search', searchQuery);
      const now = new Date();
      if (period === 'today') params.set('startDate', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString());
      if (period === 'yesterday') {
        params.set('startDate', new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString());
        params.set('endDate', new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999).toISOString());
      }
      if (period === 'last7') params.set('startDate', new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString());
      const response = await api.get<{ items: OrderListItemDTO[]; total: number }>(`/orders?${params}`);
      setOrders(response.data.items);
      setTotal(response.data.total);
      setLastConfirmedAt(Date.now());
      setHasPendingUpdates(false);
      setError(null);
    } catch (cause) {
      console.error('[OrdersListPage] Erro ao buscar pedidos:', cause);
      setError(cause instanceof ApiError ? cause.message : 'Erro ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  }, [fulfillment, origin, ownership, page, period, searchQuery, status]);

  useEffect(() => { void fetchOrders(); }, [fetchOrders]);

  useEffect(() => subscribeOrdersRealtimeEvents((event) => {
    if (event.type === 'order.changed') setHasPendingUpdates(true);
  }), []);

  const fmt = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const fmtDate = (value: string) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const resetPage = () => setPage(1);

  return (
    <main className="mx-auto max-w-[1440px] space-y-5 p-4 md:p-6">
      <PageHeader
        title="Pedidos"
        description={`${total} pedidos disponíveis para consulta e histórico`}
        icon={ShoppingBag}
        action={(
          <button type="button" onClick={() => void fetchOrders()} disabled={loading} aria-label="Atualizar lista de pedidos" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      />

      <div className="-mt-3">
        <OrdersFreshnessStatus
          connectionState={realtime.connectionState}
          isStale={realtime.isStale}
          lastConfirmedAt={lastConfirmedAt}
          now={realtime.now}
        />
      </div>

      <section aria-label="Filtros da lista de pedidos" className="space-y-3 border-y border-border bg-card py-4">
        <div className="relative">
          <label htmlFor="orders-list-search" className="sr-only">Buscar por número, cliente ou telefone</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input id="orders-list-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar número, cliente ou telefone" className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          <label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Status<select value={status} onChange={(event) => { setStatus(event.target.value as OrderStatus | ''); resetPage(); }} className={`mt-1 ${selectClass}`}>{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Origem<select value={origin} onChange={(event) => { setOrigin(event.target.value as OrderOrigin | ''); resetPage(); }} className={`mt-1 ${selectClass}`}><option value="">Todas</option><option value="PEDEHUB">PedeHub</option><option value="IFOOD">iFood</option><option value="FOOD_99">99Food</option></select></label>
          <label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Período<select value={period} onChange={(event) => { setPeriod(event.target.value as PeriodFilter); resetPage(); }} className={`mt-1 ${selectClass}`}><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="last7">Últimos 7 dias</option><option value="all">Todo período</option></select></label>
          <label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Atendimento<select value={fulfillment} onChange={(event) => { setFulfillment(event.target.value as FulfillmentType | ''); resetPage(); }} className={`mt-1 ${selectClass}`}><option value="">Todos</option><option value="delivery">Entrega</option><option value="pickup">Retirada</option><option value="dine_in">Salão</option><option value="table">Mesa</option></select></label>
          <label className="col-span-2 text-[10px] font-black uppercase tracking-wide text-muted-foreground md:col-span-1">Responsável pela entrega<select value={ownership} onChange={(event) => { setOwnership(event.target.value as OrderDeliveryOwnership | ''); resetPage(); }} className={`mt-1 ${selectClass}`}><option value="">Todos</option><option value="MERCHANT">Loja</option><option value="PROVIDER">Marketplace</option><option value="UNKNOWN">Não confirmado</option></select></label>
        </div>
      </section>

      {hasPendingUpdates ? (
        <section aria-label="Atualizações disponíveis" className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-primary">
          <div className="min-w-0">
            <p className="text-sm font-black">Há atualizações</p>
            <p className="text-xs font-semibold opacity-80">Atualize quando terminar sua consulta; filtros e página serão mantidos.</p>
          </div>
          <button
            type="button"
            onClick={() => void fetchOrders()}
            disabled={loading}
            className="min-h-10 shrink-0 rounded-lg border border-primary/30 bg-background px-4 text-xs font-black text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            Atualizar
          </button>
        </section>
      ) : null}

      {error ? (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-800 dark:text-amber-300">
          <div><p className="text-sm font-black">Atualização temporariamente indisponível</p><p className="text-xs">A última lista válida continua visível. {error}</p></div>
          <button type="button" onClick={() => void fetchOrders()} className="text-xs font-black underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Tentar novamente</button>
        </div>
      ) : null}

      {loading && orders.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground"><RefreshCw className="h-6 w-6 animate-spin" /><p className="text-sm font-bold">Carregando pedidos…</p></div>
      ) : orders.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center"><Package className="h-7 w-7 text-muted-foreground" /><p className="font-black text-foreground">Nenhum pedido corresponde aos filtros</p><p className="text-sm text-muted-foreground">Ajuste a busca, período ou origem para ampliar a consulta.</p></div>
      ) : (
        <section aria-label="Resultados da lista de pedidos" className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[130px_minmax(180px,1.2fr)_minmax(180px,1fr)_minmax(180px,1fr)_140px_44px] gap-4 border-b border-border bg-muted/50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground xl:grid">
            <span>Pedido</span><span>Cliente</span><span>Estado</span><span>Entrega</span><span className="text-right">Valor</span><span />
          </div>
          <div className="divide-y divide-border">
            {orders.map((order) => {
              const operational = order.operational;
              return (
              <button key={order.id} type="button" aria-label={`Abrir detalhes do pedido ${order.orderNumber}`} onClick={() => setSelectedOrderId(order.id)} className="group grid w-full gap-3 p-4 text-left transition hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:grid-cols-[1fr_1fr] xl:grid-cols-[130px_minmax(180px,1.2fr)_minmax(180px,1fr)_minmax(180px,1fr)_140px_44px] xl:items-center xl:gap-4">
                <div><p className="text-base font-black text-foreground">#{order.orderNumber}</p><p className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{fmtDate(order.createdAt)}</p></div>
                <div className="min-w-0"><p className="truncate text-sm font-black text-foreground">{order.customerName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{order.customerPhone}</p><span className="mt-1 inline-flex rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-black text-foreground">{operational ? providerLabel(operational) : order.sourceChannel}</span></div>
                <div className="space-y-1.5"><OrderStatusBadge status={order.status} />{operational && operational.syncState !== 'NONE' ? <p className={`text-xs font-bold ${operational.syncState === 'FAILED' ? 'text-destructive' : 'text-primary'}`}>{operational.marketplaceOperation.friendlyMessage}</p> : null}</div>
                <div className="flex items-start gap-2 text-sm"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="font-semibold text-foreground">{operational ? deliveryStatement(operational, order.fulfillmentType) : order.fulfillmentType === 'delivery' ? 'Entrega' : 'Retirada'}</span></div>
                <div className="border-t border-border pt-3 md:border-0 md:pt-0 xl:text-right"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{operational?.financialSummary.operationalValueLabel ?? 'Venda'}</p><p className="text-base font-black text-foreground">{fmt(operational?.financialSummary.operationalValue ?? order.total)}</p><p className="text-xs text-muted-foreground">{order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}</p></div>
                <div className="flex items-center justify-end"><span className="mr-2 text-xs font-bold text-muted-foreground xl:sr-only">Abrir detalhes</span><ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" /></div>
              </button>
              );
            })}
          </div>
        </section>
      )}

      {total > 20 ? (
        <nav aria-label="Paginação da lista" className="flex items-center justify-center gap-3 pt-2">
          <button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="min-h-10 rounded-lg border border-border bg-card px-4 text-xs font-black text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Anterior</button>
          <span className="text-xs font-bold text-muted-foreground">Página {page}</span>
          <button type="button" disabled={page * 20 >= total} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded-lg border border-border bg-card px-4 text-xs font-black text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Próxima</button>
        </nav>
      ) : null}

      <OrderDrawer orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} onUpdated={fetchOrders} />
    </main>
  );
}
