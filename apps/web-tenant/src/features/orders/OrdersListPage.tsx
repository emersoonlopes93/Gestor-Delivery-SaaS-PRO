import { useState, useEffect, useCallback } from 'react';
import { Package, Clock, ChevronRight, RefreshCw, ChevronLeft } from 'lucide-react';
import { 
  ORDER_STATUS_TRANSITIONS 
} from '@gestor/types';
import type { 
  OrderListItemDTO, 
  OrderStatus, 
  OrderResponseDTO, 
  UpdateOrderStatusDTO 
} from '@gestor/types';

const API_BASE = '/api/v1';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready_for_pickup: 'Pronto p/ Retirada',
  ready_for_delivery: 'Pronto p/ Entrega',
  out_for_delivery: 'Saiu p/ Entrega',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-orange-100 text-orange-800',
  ready_for_pickup: 'bg-green-100 text-green-800',
  ready_for_delivery: 'bg-green-100 text-green-800',
  out_for_delivery: 'bg-purple-100 text-purple-800',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-800',
};

export function OrdersListPage() {
  const [orders, setOrders] = useState<OrderListItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const token = localStorage.getItem('accessToken');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`${API_BASE}/orders?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setOrders(json.data || []);
      setTotal(json.total || 0);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  if (selectedOrderId) {
    return <OrderDetailPanel orderId={selectedOrderId} onBack={() => { setSelectedOrderId(null); fetchOrders(); }} />;
  }

  return (
    <div className="p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500 mt-1">{total} pedidos encontrados</p>
        </div>
        <button onClick={fetchOrders} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors" title="Atualizar">
          <RefreshCw className="w-5 h-5 text-gray-600" />
        </button>
      </header>

      {/* Status Filter */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-4">
        <button
          onClick={() => { setStatusFilter(''); setPage(1); }}
          className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border ${
            statusFilter === '' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
          }`}
        >
          Todos
        </button>
        {(Object.keys(STATUS_LABELS) as OrderStatus[]).map(status => (
          <button
            key={status}
            onClick={() => { setStatusFilter(status); setPage(1); }}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border ${
              statusFilter === status ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <button
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              className="w-full bg-white rounded-xl p-4 border border-gray-100 hover:border-gray-200 transition-all flex items-center justify-between text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center">
                  <span className="text-sm font-black text-gray-700">{order.orderNumber}</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">{order.customerName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-[10px] text-gray-400">{order.fulfillmentType === 'delivery' ? '📦' : '🏪'}</span>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {fmtDate(order.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="font-black text-gray-900">{fmt(order.total)}</span>
                  <p className="text-[10px] text-gray-400">{order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2 mt-6">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-bold disabled:opacity-30">Anterior</button>
          <span className="px-4 py-2 text-sm text-gray-500">Página {page}</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-bold disabled:opacity-30">Próxima</button>
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

  const token = localStorage.getItem('accessToken');

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setOrder(json);
    } catch {
      // Handle
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleStatusUpdate = async (newStatus: OrderStatus) => {
    if (updating) return;
    setUpdating(true);
    try {
      const body: UpdateOrderStatusDTO = { status: newStatus };
      const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setOrder(json);
    } catch {
      // Handle
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
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1">
        ← Voltar aos pedidos
      </button>

      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
          <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase mt-2 inline-block ${STATUS_COLORS[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-gray-900">{fmt(order.total)}</span>
          <p className="text-xs text-gray-400 mt-1">{order.fulfillmentType === 'delivery' ? '📦 Entrega' : '🏪 Retirada'}</p>
        </div>
      </header>

      {/* Status Actions */}
      {validTransitions.length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
          <p className="text-xs font-bold text-blue-700 uppercase mb-3">Ações Disponíveis</p>
          <div className="flex gap-2 flex-wrap">
            {validTransitions.map(status => (
              <button
                key={status}
                onClick={() => handleStatusUpdate(status)}
                disabled={updating}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                  status === 'cancelled'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                } disabled:opacity-50`}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Customer */}
      <section className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Cliente</h3>
        <p className="font-bold text-gray-900">{order.customerName}</p>
        <p className="text-sm text-gray-500">{order.customerPhone}</p>
        {order.customerEmail && <p className="text-sm text-gray-500">{order.customerEmail}</p>}
      </section>

      {/* Delivery Address */}
      {order.deliveryAddress && (
        <section className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Endereço</h3>
          <p className="text-sm text-gray-700">
            {order.deliveryAddress.street}, {order.deliveryAddress.number}
            {order.deliveryAddress.complement ? ` - ${order.deliveryAddress.complement}` : ''}
          </p>
          <p className="text-sm text-gray-500">
            {order.deliveryAddress.neighborhood} — {order.deliveryAddress.city}/{order.deliveryAddress.state} — CEP {order.deliveryAddress.zipCode}
          </p>
          {order.deliveryAddress.reference && (
            <p className="text-xs text-gray-400 mt-1 italic">Ref: {order.deliveryAddress.reference}</p>
          )}
        </section>
      )}

      {/* Items */}
      <section className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Itens</h3>
        <div className="space-y-3">
          {order.items.map(item => (
            <div key={item.id} className="flex justify-between text-sm">
              <div>
                <span className="font-bold text-gray-800">{item.quantity}x</span>{' '}
                <span className="text-gray-700">{item.snapshotName}</span>
                <span className="text-[10px] text-gray-400 ml-1 uppercase">[{item.lineType}]</span>
                {item.snapshotComposition && (
                  <p className="text-[11px] text-gray-400 italic">{item.snapshotComposition}</p>
                )}
              </div>
              <span className="font-bold text-gray-800 ml-4">{fmt(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="border-t mt-4 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500"><span>Subtotal itens</span><span>{fmt(order.itemsSubtotal)}</span></div>
          {order.discountTotal > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>-{fmt(order.discountTotal)}</span></div>}
          {order.deliveryFee > 0 && <div className="flex justify-between text-gray-500"><span>Entrega</span><span>{fmt(order.deliveryFee)}</span></div>}
          {order.serviceFee > 0 && <div className="flex justify-between text-gray-500"><span>Taxa de serviço</span><span>{fmt(order.serviceFee)}</span></div>}
          <div className="flex justify-between font-black text-gray-900 pt-2 border-t"><span>Total</span><span>{fmt(order.total)}</span></div>
        </div>
      </section>

      {/* Notes */}
      {order.notes && (
        <section className="bg-orange-50 rounded-xl p-4 border border-orange-100 mb-4">
          <h3 className="text-xs font-bold text-orange-700 uppercase mb-1">Observações</h3>
          <p className="text-sm text-orange-800 italic">{order.notes}</p>
        </section>
      )}

      {/* Timeline */}
      <section className="bg-white rounded-xl p-4 border border-gray-100">
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
                {entry.note && <p className="text-xs text-gray-500 italic mt-0.5">{entry.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
