import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Clock, CheckCircle2, PlayCircle, ChefHat } from 'lucide-react';
import type { OrderKdsItemDTO, OrderStatus, UpdateOrderStatusDTO } from '@gestor/types';

const API_BASE = '/api/v1';

export function KdsPage() {
  const [orders, setOrders] = useState<OrderKdsItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const token = localStorage.getItem('accessToken');

  const fetchKds = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/orders/operation/kds`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setOrders(json || []);
      }
    } catch {
      // Ignore
    } finally {
      if (loading) setLoading(false);
    }
  }, [token, loading]);

  useEffect(() => {
    fetchKds();
    const interval = setInterval(fetchKds, 15000); // 15s polling
    return () => clearInterval(interval);
  }, [fetchKds]);

  const handleStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    if (updatingId) return;
    setUpdatingId(orderId);
    try {
      const body: UpdateOrderStatusDTO = { status: newStatus };
      const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchKds();
      }
    } catch {
      // Ignore
    } finally {
      setUpdatingId(null);
    }
  };

  const getElapsedMin = (createdAt: string) => {
    const min = Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / 60000);
    return min >= 0 ? min : 0;
  };

  return (
    <div className="p-6 h-[calc(100vh-64px)] flex flex-col bg-gray-50/50">
      <header className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <ChefHat className="w-8 h-8 text-blue-600" /> KDS
          </h1>
          <p className="text-sm text-gray-500 mt-1">Visão da Cozinha (Atualizado 15s)</p>
        </div>
        <button onClick={fetchKds} className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm" title="Atualizar">
          <RefreshCw className="w-6 h-6 text-gray-700" />
        </button>
      </header>

      {loading ? (
        <div className="text-center py-12 text-gray-400 font-bold text-lg">Carregando painel KDS...</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center grow pb-20">
          <ChefHat className="w-16 h-16 text-gray-200 mb-4" />
          <h2 className="text-2xl font-black text-gray-400">Nenhum pedido na fila!</h2>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-4 grow items-start snap-x">
          {orders.map(order => {
            const isPreparing = order.status === 'preparing';
            const elapsed = getElapsedMin(order.createdAt);
            const isUrgent = elapsed > 20; // Cozinha: 20 min é urgente na cor

            return (
              <div 
                key={order.id} 
                className={`min-w-[340px] w-[340px] rounded-2xl flex flex-col max-h-full border shadow-sm snap-start ${
                  isPreparing 
                    ? 'bg-blue-50/30 border-blue-200' 
                    : 'bg-white border-gray-200'
                }`}
              >
                {/* Cabeçalho do Ticket */}
                <header className={`p-4 rounded-t-2xl flex justify-between items-start shrink-0 ${isPreparing ? 'bg-blue-600' : 'bg-gray-800'}`}>
                  <div>
                    <h2 className="text-3xl font-black text-white">{order.orderNumber}</h2>
                    <span className="text-blue-100 text-xs font-medium uppercase tracking-wider">
                      {order.fulfillmentType === 'delivery' ? 'Entrega' : 'Retirada'}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg font-black text-sm ${
                    isUrgent ? 'bg-red-500 text-white' : 'bg-white/20 text-white'
                  }`}>
                    <Clock className="w-4 h-4" /> {elapsed}m
                  </div>
                </header>

                <div className="p-5 overflow-y-auto grow bg-white/50">
                  {/* Observações Gerais */}
                  {order.notes && (
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-4">
                      <p className="text-xs font-black text-orange-800 uppercase tracking-widest mb-1">Obs. do Pedido:</p>
                      <p className="text-sm font-bold text-orange-900 leading-tight">{order.notes}</p>
                    </div>
                  )}

                  {/* Itens */}
                  <div className="space-y-4">
                    {order.items.map((item, idx) => (
                      <div key={item.id} className={`${idx !== 0 ? 'pt-4 border-t border-gray-200/60' : ''}`}>
                        <div className="flex gap-3">
                          <span className="text-xl font-black text-gray-900 bg-gray-100 px-2 py-0.5 rounded leading-none self-start">
                            {item.quantity}
                          </span>
                          <div className="grow">
                            <h3 className="text-lg font-black text-gray-900 leading-tight">{item.snapshotName}</h3>
                            
                            {item.snapshotComposition && (
                              <p className="text-sm text-gray-500 italic mt-0.5 leading-tight">{item.snapshotComposition}</p>
                            )}

                            {/* Complementos e Combos */}
                            {(item.complements.length > 0 || item.comboSelections.length > 0) && (
                              <ul className="mt-2 space-y-1">
                                {item.complements.map(comp => (
                                  <li key={comp.id} className="text-sm font-bold text-gray-600 flex items-start gap-1.5">
                                    <span className="text-gray-400 mt-1">&bull;</span> + {comp.snapshotName}
                                  </li>
                                ))}
                                {item.comboSelections.map(sel => (
                                  <li key={sel.id} className="text-sm font-bold text-gray-600 flex items-start gap-1.5">
                                    <span className="text-gray-400 mt-1">&rarr;</span> {sel.snapshotProductName}
                                  </li>
                                ))}
                              </ul>
                            )}

                            {/* Item Notes */}
                            {item.notes && (
                              <div className="mt-2 bg-yellow-50 text-yellow-900 text-sm font-bold p-2 relative rounded">
                                <span className="absolute -left-1 text-yellow-400 font-serif text-2xl leading-none">"</span>
                                <span className="pl-2 relative z-10">{item.notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Actions */}
                <footer className="p-4 bg-white rounded-b-2xl border-t border-gray-100 shrink-0">
                  {order.status === 'confirmed' && (
                    <button
                      onClick={() => handleStatusUpdate(order.id, 'preparing')}
                      disabled={updatingId === order.id}
                      className="w-full bg-blue-100 hover:bg-blue-200 text-blue-800 text-lg font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 uppercase tracking-widest"
                    >
                      <PlayCircle className="w-6 h-6" /> Iniciar Preparo
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => handleStatusUpdate(order.id, order.fulfillmentType === 'delivery' ? 'ready_for_delivery' : 'ready_for_pickup')}
                      disabled={updatingId === order.id}
                      className="w-full bg-green-500 hover:bg-green-600 shadow-md text-white border-t border-green-400/50 text-lg font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 uppercase tracking-widest"
                    >
                      <CheckCircle2 className="w-6 h-6" /> Concluir
                    </button>
                  )}
                </footer>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
