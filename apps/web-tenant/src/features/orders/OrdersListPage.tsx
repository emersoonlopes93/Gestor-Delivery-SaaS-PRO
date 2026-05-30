import { useState, useEffect, useCallback } from 'react';
import { Package, Clock, ChevronRight, RefreshCw, Filter, ShoppingBag } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import type { OrderListItemDTO } from '@gestor/types';
import { OrderDrawer } from './components/OrderDrawer';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';

// Bypass persistent build error by defining locally
type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'ready_for_delivery' | 'out_for_delivery' | 'completed' | 'cancelled' | 'draft';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready_for_pickup: 'Pronto p/ Retirada',
  ready_for_delivery: 'Pronto p/ Entrega',
  out_for_delivery: 'Saiu p/ Entrega',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  draft: 'Rascunho',
};

const CHANNEL_LABELS: Record<string, string> = {
  storefront: 'Loja Online',
  pos: 'PDV / Balcão',
  whatsapp_ai: 'Agente WhatsApp',
  whatsapp: 'WhatsApp Manual',
  ifood: 'iFood',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'status-badge-pending',
  confirmed: 'status-badge-confirmed',
  preparing: 'status-badge-preparing',
  ready_for_pickup: 'status-badge-success',
  ready_for_delivery: 'status-badge-success',
  out_for_delivery: 'status-badge-confirmed',
  completed: 'status-badge-neutral',
  cancelled: 'status-badge-danger',
  draft: 'status-badge-neutral',
};

export function OrdersListPage() {
  const [orders, setOrders] = useState<OrderListItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'hoje' | 'ontem' | 'ultimos7' | 'todos'>('hoje');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (channelFilter) params.set('channel', channelFilter);

      const now = new Date();
      if (dateFilter === 'hoje') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        params.set('startDate', start.toISOString());
      } else if (dateFilter === 'ontem') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        params.set('startDate', start.toISOString());
        params.set('endDate', end.toISOString());
      } else if (dateFilter === 'ultimos7') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        params.set('startDate', start.toISOString());
      }

      const res = await api.get<{ items: OrderListItemDTO[]; total: number }>(
        `/orders?${params.toString()}`
      );

      setOrders(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      console.error('[OrdersListPage] Erro ao buscar pedidos:', err);
      const msg = err instanceof ApiError ? err.message : 'Erro ao carregar pedidos';
      setError(msg);
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, channelFilter, dateFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Gestor de Pedidos"
        description={`${total} pedidos registrados na base`}
        icon={ShoppingBag}
        action={
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="btn-icon bg-card text-foreground hover:bg-muted border border-border w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition-all shadow-sm shrink-0"
            title="Atualizar Pedidos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Error */}
      {error && (
        <div className="alert-danger rounded-2xl p-4 flex items-start gap-3 border border-destructive/20 bg-destructive/10">
          <span className="text-lg leading-none font-black text-destructive">⚠</span>
          <div className="flex-1">
            <h3 className="text-sm font-black mb-1 text-destructive">Erro ao carregar pedidos</h3>
            <p className="text-sm text-destructive opacity-90">{error}</p>
            <button
              onClick={fetchOrders}
              className="mt-2 text-xs font-black underline text-destructive hover:opacity-100"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Filtros Premium */}
      <Card variant="default" className="p-5 md:p-6 shadow-sm border border-border rounded-3xl">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-foreground font-black text-xs uppercase tracking-widest opacity-80">
            <Filter className="w-4 h-4 text-primary" />
            <span>Filtros e Status</span>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 border-b border-border/60">
            <button
              onClick={() => { setStatusFilter(''); setPage(1); }}
              disabled={loading}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                statusFilter === ''
                  ? 'bg-primary text-primary-foreground border-primary shadow-md'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              }`}
            >
              Todos
            </button>
            {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => { setStatusFilter(status); setPage(1); }}
                disabled={loading}
                className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  statusFilter === status
                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                }`}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-[10px] font-black uppercase text-muted-foreground mb-1.5 tracking-wider">Período de Visualização</label>
              <select
                value={dateFilter}
                onChange={(e) => { setDateFilter(e.target.value as 'hoje' | 'ontem' | 'ultimos7' | 'todos'); setPage(1); }}
                disabled={loading}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-bold text-foreground outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary/20"
              >
                <option value="hoje">Hoje</option>
                <option value="ontem">Ontem</option>
                <option value="ultimos7">Últimos 7 dias</option>
                <option value="todos">Todo período</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-muted-foreground mb-1.5 tracking-wider">Canal de Venda / Origem</label>
              <select
                value={channelFilter}
                onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
                disabled={loading}
                className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm font-bold text-foreground outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary/20"
              >
                <option value="">Todos os canais</option>
                {Object.entries(CHANNEL_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Sincronizando Pedidos...</p>
        </div>
      )}

      {/* Lista de Pedidos */}
      {!loading && !error && (
        orders.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-3xl flex flex-col items-center justify-center gap-4 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Package className="w-8 h-8 text-muted-foreground opacity-60" />
            </div>
            <div>
              <p className="text-foreground font-black text-base uppercase tracking-wider mb-1">Nenhum pedido</p>
              <p className="text-muted-foreground text-sm">Não há pedidos registrados para os filtros selecionados.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className="w-full bg-card border border-border rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between text-left group hover:bg-muted/30 hover:scale-[1.005] hover:shadow-md transition-all duration-200 outline-none focus:ring-2 focus:ring-primary/20"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 bg-muted border border-border font-black text-foreground text-base shadow-sm"
                  >
                    #{order.orderNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-foreground text-base truncate leading-tight">{order.customerName}</h3>
                    
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`badge-premium ${STATUS_COLORS[order.status]} text-[10px] font-black uppercase tracking-wider py-1 px-2 rounded-lg`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-lg bg-muted text-foreground border border-border font-bold flex items-center gap-1.5 shadow-sm">
                        <span>{order.fulfillmentType === 'delivery' ? '📦 Entrega' : '🏪 Retirada'}</span>
                      </span>
                      <span className="text-xs px-2 py-1 rounded-lg bg-muted text-muted-foreground border border-border/50 font-bold">
                        {CHANNEL_LABELS[order.sourceChannel] || order.sourceChannel}
                      </span>
                      <span className="text-xs text-muted-foreground font-bold flex items-center gap-1.5 ml-1">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        {fmtDate(order.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 shrink-0 mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-border">
                  <div className="text-left md:text-right">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground leading-none mb-1">Total Geral</p>
                    <span className="font-black text-foreground text-xl leading-none">{fmt(order.total)}</span>
                    <p className="text-[10px] font-bold text-muted-foreground mt-1">{order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-200">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center items-center gap-2 mt-8 pt-4">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest bg-card border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Página {page}</span>
          <button
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest bg-card border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
          >
            Próxima
          </button>
        </div>
      )}

      <OrderDrawer 
        orderId={selectedOrderId} 
        onClose={() => setSelectedOrderId(null)} 
        onUpdated={fetchOrders}
      />
    </div>
  );
}

