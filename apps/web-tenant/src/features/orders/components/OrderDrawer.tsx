import { memo, useEffect, useState } from 'react';
import { X, MapPin, Phone, MessageSquare, Printer, Edit2, Ban, Truck, Clock, CheckCircle } from 'lucide-react';
import type { OrderResponseDTO, OrderStatus, OrderTimelineEntryDTO } from '@gestor/types';
import { api } from '../../../../lib/api-client';
import { StatusBadge } from './OrderCard';
import { EditOrderModal } from './EditOrderModal';

export interface OrderDrawerProps {
  orderId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const OrderDrawer = memo(function OrderDrawer({ orderId, onClose, onUpdated }: OrderDrawerProps) {
  const [order, setOrder] = useState<OrderResponseDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setError('');
      return;
    }
    const fetchDetail = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get<OrderResponseDTO>(`/orders/${orderId}`);
        if (res.data) setOrder(res.data);
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar detalhes');
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [orderId]);

  const handleSavedEdit = () => {
    setIsEditModalOpen(false);
    onUpdated(); // Refresh the board
    // Refresh the local drawer data too
    if (orderId) {
      api.get<OrderResponseDTO>(`/orders/${orderId}`).then(res => {
        if (res.data) setOrder(res.data);
      });
    }
  };

  if (!orderId) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      <div 
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[450px] bg-white dark:bg-slate-900 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0 border-l border-slate-200 dark:border-slate-800`}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              Pedido #{order?.orderNumber || '...'}
              {order && <StatusBadge status={order.status} />}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {order ? `Via ${order.sourceChannel}` : 'Carregando...'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-2 border-primary-600/20 border-t-primary-600 animate-spin" />
            </div>
          ) : error ? (
            <div className="alert-danger p-4 rounded-xl text-sm">{error}</div>
          ) : order ? (
            <>
              {/* Cliente */}
              <section>
                <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3">Cliente</h3>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white">{order.customerName}</p>
                  {order.customerPhone && (
                    <div className="flex items-center gap-2 mt-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-sm text-slate-600 dark:text-slate-300">{order.customerPhone}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Entrega */}
              {order.fulfillmentType === 'delivery' && order.deliveryAddress && (
                <section>
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3">Entrega</h3>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {order.deliveryAddress.street}, {order.deliveryAddress.number}
                        {order.deliveryAddress.complement && ` - ${order.deliveryAddress.complement}`}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {order.deliveryAddress.neighborhood} - {order.deliveryAddress.city}
                      </p>
                      {order.deliveryAddress.reference && (
                        <p className="text-xs text-slate-500 mt-1 italic">Ref: {order.deliveryAddress.reference}</p>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Itens */}
              <section>
                <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3 flex justify-between items-center">
                  <span>Resumo do Pedido</span>
                  <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full">{order.items.length} itens</span>
                </h3>
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-start py-2 border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          <span className="text-primary-600 mr-1">{item.quantity}x</span> 
                          {item.snapshotName}
                        </p>
                        {item.notes && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1">
                            <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" /> {item.notes}
                          </p>
                        )}
                        {item.complements?.map(c => (
                          <p key={c.id} className="text-xs text-slate-500 mt-0.5 pl-4">+ {c.snapshotName}</p>
                        ))}
                      </div>
                      <span className="text-sm font-bold">R$ {item.lineTotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Totais */}
              <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal</span>
                    <span>R$ {order.itemsSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Taxa de Entrega</span>
                    <span>R$ {order.deliveryFee.toFixed(2)}</span>
                  </div>
                  {order.discountTotal > 0 && (
                    <div className="flex justify-between text-emerald-500">
                      <span>Desconto</span>
                      <span>- R$ {order.discountTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-lg pt-2 border-t border-slate-200 dark:border-slate-700 mt-2">
                    <span>Total</span>
                    <span>R$ {order.total.toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-xl">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Pagamento</span>
                  <span className="text-sm font-black capitalize">{order.paymentMethod.replace('_', ' ')}</span>
                </div>
              </section>

              {/* Timeline */}
              <section>
                <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-4">Timeline</h3>
                <div className="space-y-4">
                  {order.timeline.map((entry: OrderTimelineEntryDTO, index: number) => (
                    <div key={entry.id} className="flex gap-3 relative">
                      {index !== order.timeline.length - 1 && (
                        <div className="absolute top-6 left-2.5 w-px h-full bg-slate-200 dark:bg-slate-700" />
                      )}
                      <div className="relative z-10 w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle className="w-3 h-3 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white capitalize">
                          {entry.status.replace('_', ' ')}
                        </p>
                        {entry.note && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{entry.note}</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        {order && (
          <footer className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-2 gap-2 shrink-0">
            {['pending', 'confirmed', 'preparing'].includes(order.status) && (
              <button 
                onClick={() => setIsEditModalOpen(true)}
                className="col-span-2 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Edit2 className="w-4 h-4" /> Editar Pedido
              </button>
            )}
            <button className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button className="py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
              <Ban className="w-4 h-4" /> Cancelar
            </button>
          </footer>
        )}
      </div>

      {isEditModalOpen && (
        <EditOrderModal 
          order={order}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={handleSavedEdit}
        />
      )}
    </>
  );
});
