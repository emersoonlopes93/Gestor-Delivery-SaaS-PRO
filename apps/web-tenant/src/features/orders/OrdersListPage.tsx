import { useState, useEffect, useCallback } from 'react';
import { Package, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import type { 
  OrderListItemDTO, 
  OrderResponseDTO, 
  UpdateOrderStatusDTO 
} from '@gestor/types';

// Bypass persistent build error by defining locally
type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'ready_for_delivery' | 'out_for_delivery' | 'completed' | 'cancelled' | 'draft';
const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'ready_for_delivery', 'cancelled'],
  ready_for_pickup: ['completed'],
  ready_for_delivery: ['out_for_delivery'],
  out_for_delivery: ['completed'],
  completed: [],
  cancelled: [],
  draft: ['confirmed', 'cancelled'],
};

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

  if (selectedOrderId) {
    return <OrderDetailPanel orderId={selectedOrderId} onBack={() => { setSelectedOrderId(null); fetchOrders(); }} />;
  }

  return (
    <div className="p-4 md:p-6">
      <header className="page-header mb-6">
        <div>
          <h1 className="page-title">Pedidos</h1>
          <p className="page-subtitle">{total} pedidos encontrados</p>
        </div>
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="btn-icon"
          title="Atualizar"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Error */}
      {error && (
        <div className="alert-danger rounded-2xl p-4 mb-4 flex items-start gap-3">
          <span className="text-lg leading-none font-black">⚠</span>
          <div className="flex-1">
            <h3 className="text-sm font-black mb-1">Erro ao carregar pedidos</h3>
            <p className="text-sm opacity-80">{error}</p>
            <button
              onClick={fetchOrders}
              className="mt-2 text-xs font-black underline opacity-80 hover:opacity-100"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Status Filter */}
      <div className="toolbar-bar mb-5">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            onClick={() => { setStatusFilter(''); setPage(1); }}
            disabled={loading}
            className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-50 ${
              statusFilter === ''
                ? 'bg-primary-600 text-white border-primary-600 shadow-sm shadow-primary-500/20'
                : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-800'
            }`}
          >
            Todos
          </button>
          {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setPage(1); }}
              disabled={loading}
              className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all disabled:opacity-50 ${
                statusFilter === status
                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm shadow-primary-500/20'
                  : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-800'
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
        
        {/* Additional Filters */}
        <div className="flex gap-4 mt-4 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="flex-1">
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Período</label>
            <select
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value as any); setPage(1); }}
              disabled={loading}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-primary-500"
            >
              <option value="hoje">Hoje</option>
              <option value="ontem">Ontem</option>
              <option value="ultimos7">Últimos 7 dias</option>
              <option value="todos">Todo período</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Canal de Venda</label>
            <select
              value={channelFilter}
              onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
              disabled={loading}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-primary-500"
            >
              <option value="">Todos os canais</option>
              {Object.entries(CHANNEL_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary-600/20 border-t-primary-600 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Carregando pedidos...</p>
        </div>
      )}

      {/* Orders List */}
      {!loading && !error && (
        orders.length === 0 ? (
          <div className="text-center py-16 card-premium flex flex-col items-center gap-3">
            <Package className="w-12 h-12 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Nenhum pedido encontrado.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className="w-full card-premium-hover p-4 flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)' }}
                  >
                    <span className="text-sm font-black text-slate-700 dark:text-slate-300">{order.orderNumber}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{order.customerName}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`badge-premium ${STATUS_COLORS[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                      <span className="text-[10px] text-slate-400">{order.fulfillmentType === 'delivery' ? '📦' : '🏪'}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-bold text-slate-500 dark:text-slate-400"
                        style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)' }}
                      >
                        {CHANNEL_LABELS[order.sourceChannel] || order.sourceChannel}
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />{fmtDate(order.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-3">
                  <div className="text-right hidden sm:block">
                    <span className="font-black text-slate-900 dark:text-slate-100 text-sm">{fmt(order.total)}</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">{order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-secondary px-4 py-2 text-xs disabled:opacity-30"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 font-medium">Página {page}</span>
          <button
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary px-4 py-2 text-xs disabled:opacity-30"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// ORDER DETAIL PANEL (inline for now)
// ----------------------------------------------------------------



function OrderDetailPanel({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const [order, setOrder] = useState<OrderResponseDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<OrderResponseDTO>(`/orders/${orderId}`);
      if (res.success) {
        setOrder(res.data);
      }
    } catch (err) {
       console.error('[OrderDetailPanel] Erro ao buscar pedido:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleStatusUpdate = async (newStatus: OrderStatus) => {
    if (updating) return;
    setUpdating(true);
    try {
      const body: UpdateOrderStatusDTO = { status: newStatus };
      const res = await api.patch<OrderResponseDTO>(`/orders/${orderId}/status`, body);
      
      if (res.success) {
        // O backend retorna o Order atualizado, mas precisamos garantir tipagem
        // Na verdade o OrdersService.updateOrderStatus hoje retorna o prisma object,
        // mas o Interceptor vai envolver em { success, data }.
        // O ideal é que o data seja o OrderResponseDTO.
        // Vamos forçar um refresh para garantir a consistência total do DTO de detalhe.
        await fetchOrder();
      }
    } catch (err) {
      console.error('[OrderDetailPanel] Erro ao atualizar status:', err);
    } finally {
      setUpdating(false);
    }
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  if (loading || !order) {
    return <div className="p-6 text-center text-gray-400">Carregando pedido...</div>;
  }

  const validTransitions = ORDER_STATUS_TRANSITIONS[order.status];

  return (
    <div className="p-6 max-w-2xl">
      <button onClick={onBack} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-1">
        ← Voltar aos pedidos
      </button>

      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</h1>
          <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase mt-2 inline-block ${STATUS_COLORS[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-gray-900 dark:text-gray-100">{fmt(order.total)}</span>
          <p className="text-xs text-gray-400 mt-1">{order.fulfillmentType === 'delivery' ? '📦 Entrega' : '🏪 Retirada'}</p>
          <div className="mt-1">
            <span className="text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-800">
              Canal: {CHANNEL_LABELS[order.sourceChannel] || order.sourceChannel}
            </span>
          </div>
        </div>
      </header>

      {/* Status Actions */}
      {validTransitions.length > 0 && (
        <div className="bg-primary-500/5 border border-primary-500/20 rounded-2xl p-5 mb-6">
          <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-4">Ações Disponíveis</p>
          <div className="flex gap-2 flex-wrap">
            {validTransitions.map(status => (
              <button
                key={status}
                onClick={() => handleStatusUpdate(status)}
                disabled={updating}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 ${
                  status === 'cancelled'
                    ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-900/10'
                    : 'bg-primary-600 text-white hover:bg-primary-700 shadow-primary-900/10'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Customer */}
      <section className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800 mb-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Cliente</h3>
        <p className="font-bold text-gray-900 dark:text-gray-100">{order.customerName}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{order.customerPhone}</p>
        {order.customerEmail && <p className="text-sm text-gray-500 dark:text-gray-400">{order.customerEmail}</p>}
      </section>

      {/* Delivery Address */}
      {order.deliveryAddress && (
        <section className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800 mb-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Endereço</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {order.deliveryAddress.street}, {order.deliveryAddress.number}
            {order.deliveryAddress.complement ? ` - ${order.deliveryAddress.complement}` : ''}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {order.deliveryAddress.neighborhood} — {order.deliveryAddress.city}/{order.deliveryAddress.state} — CEP {order.deliveryAddress.zipCode}
          </p>
          {order.deliveryAddress.reference && (
            <p className="text-xs text-gray-400 mt-1 italic">Ref: {order.deliveryAddress.reference}</p>
          )}
        </section>
      )}

      {/* Items */}
      <section className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800 mb-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Itens</h3>
        <div className="space-y-3">
          {order.items.map(item => (
            <div key={item.id} className="flex justify-between text-sm">
              <div>
                <span className="font-bold text-gray-800 dark:text-gray-200">{item.quantity}x</span>{' '}
                <span className="text-gray-700 dark:text-gray-300">{item.snapshotName}</span>
                <span className="text-[10px] text-gray-400 ml-1 uppercase">[{item.lineType}]</span>
                {item.snapshotComposition && (
                  <p className="text-[11px] text-gray-400 italic">{item.snapshotComposition}</p>
                )}
              </div>
              <span className="font-bold text-gray-800 dark:text-gray-200 ml-4">{fmt(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="border-t mt-4 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Subtotal itens</span><span>{fmt(order.itemsSubtotal)}</span></div>
          {order.discountTotal > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>-{fmt(order.discountTotal)}</span></div>}
          {order.deliveryFee > 0 && <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Entrega</span><span>{fmt(order.deliveryFee)}</span></div>}
          {order.serviceFee > 0 && <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>Taxa de serviço</span><span>{fmt(order.serviceFee)}</span></div>}
          <div className="flex justify-between font-black text-gray-900 dark:text-gray-100 pt-2 border-t"><span>Total</span><span>{fmt(order.total)}</span></div>
        </div>
      </section>

      {/* Notes */}
      {order.notes && (
        <section className="bg-amber-500/5 dark:bg-amber-500/10 rounded-2xl p-5 border border-amber-500/10 dark:border-amber-500/20 mb-4">
          <h3 className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">Observações do Pedido</h3>
          <p className="text-sm text-amber-900 dark:text-amber-200 font-medium italic">"{order.notes}"</p>
        </section>
      )}

      {/* Timeline */}
      <section className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Timeline</h3>
        <div className="space-y-3">
          {order.timeline.map(entry => (
            <div key={entry.id} className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
              <div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${STATUS_COLORS[entry.status]}`}>
                  {STATUS_LABELS[entry.status]}
                </span>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(entry.createdAt).toLocaleString('pt-BR')}
                </p>
                {entry.note && <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-0.5">{entry.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
