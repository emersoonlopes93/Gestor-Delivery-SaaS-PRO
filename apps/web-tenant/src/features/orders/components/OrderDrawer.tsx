import { memo, useEffect, useState, useCallback } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { SOURCE_CHANNEL_LABELS, type OrderResponseDTO, type OrderStatus, type UpdateOrderStatusDTO, type DriverDTO } from '@gestor/types';
import { api, ApiError } from '@/lib/api-client';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderCustomerSection } from './OrderCustomerSection';
import { OrderFulfillmentSection } from './OrderFulfillmentSection';
import { OrderItemsSection } from './OrderItemsSection';
import { OrderPaymentSection } from './OrderPaymentSection';
import { OrderDriverSection } from './OrderDriverSection';
import { OrderTimelineSection } from './OrderTimelineSection';
import { OrderActionsBar } from './OrderActionsBar';
import { OrderPrintTemplate } from './OrderPrintTemplate';
import { EditOrderModal } from './EditOrderModal';
import { DriverSelectionModal } from './DriverSelectionModal';
import { Capacitor } from '@capacitor/core';
import { printTicketViaPrimaryBluetooth } from '../../../lib/bluetooth';
import { printThermalText } from '../../../lib/thermal-print';
import toast from 'react-hot-toast';

export interface OrderDrawerProps {
  orderId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const OrderDrawer = memo(function OrderDrawer({ orderId, onClose, onUpdated }: OrderDrawerProps) {
  const [order, setOrder] = useState<OrderResponseDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [drivers, setDrivers] = useState<DriverDTO[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);

  const fetchDetail = useCallback(async (quiet = false) => {
    if (!orderId) return;
    if (!quiet) setLoading(true);
    else setIsValidating(true);
    
    setError('');
    try {
      const res = await api.get<OrderResponseDTO>(`/orders/${orderId}`);
      if (res.data) setOrder(res.data);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao carregar detalhes';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setIsValidating(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (orderId) {
      fetchDetail();
    } else {
      setOrder(null);
      setError('');
    }
  }, [orderId, fetchDetail]);

  const fetchDrivers = async () => {
    try {
      const res = await api.get<DriverDTO[]>('/delivery/drivers');
      setDrivers(res.data || []);
    } catch (err) {
      console.error('[OrderDrawer] Erro ao buscar entregadores:', err);
    }
  };

  const handleStatusUpdate = async (newStatus: OrderStatus, driverId?: string) => {
    if (!order || isUpdating) return;

    // Se for despacho e não tiver entregador, abre modal
    if (newStatus === 'out_for_delivery' && order.fulfillmentType === 'delivery' && !order.deliveryDriverId && !driverId) {
      await fetchDrivers();
      setIsDriverModalOpen(true);
      return;
    }

    setIsUpdating(true);
    try {
      if (driverId) {
        await api.post(`/orders/${order.id}/assign-driver`, { driverId });
      }

      const body: UpdateOrderStatusDTO = { status: newStatus };
      const res = await api.patch<OrderResponseDTO>(`/orders/${order.id}/status`, body);
      
      if (res.success) {
        toast.success(`Pedido ${newStatus === 'cancelled' ? 'cancelado' : 'atualizado'}!`);
        await fetchDetail(true);
        onUpdated();
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao atualizar pedido';
      toast.error(msg);
    } finally {
      setIsUpdating(false);
      setIsDriverModalOpen(false);
    }
  };

  const handleAdvance = () => {
    if (!order) return;
    const { status, fulfillmentType } = order;
    
    let next: OrderStatus | null = null;
    if (status === 'pending') next = 'confirmed';
    else if (status === 'confirmed') next = 'preparing';
    else if (status === 'preparing') next = fulfillmentType === 'delivery' ? 'ready_for_delivery' : 'ready_for_pickup';
    else if (status === 'ready_for_delivery') next = 'out_for_delivery';
    else if (status === 'ready_for_pickup' || status === 'out_for_delivery') next = 'completed';

    if (next) handleStatusUpdate(next);
  };

  const handlePrint = async () => {
    if (!order) return;
    setIsPrinting(true);
    try {
      const printRes = await api.get<{ content: string }>(`/pos/sales/${order.id}/print?type=customer`);
      await api.post(`/orders/${order.id}/print-log`);
      if (Capacitor.isNativePlatform() && printRes.data?.content) {
        await printTicketViaPrimaryBluetooth(printRes.data.content);
        setIsPrinting(false);
        toast.success('Impressao enviada para a Bluetooth principal.');
        fetchDetail(true);
        return;
      }
      printThermalText(printRes.data.content, { title: `Pedido #${order.orderNumber}`, paperWidthMm: 58 });
      setIsPrinting(false);
      toast.success('Imprimindo...');
      fetchDetail(true);
    } catch (err) {
      console.error('[OrderDrawer] Erro ao registrar impressao:', err);
      setIsPrinting(false);
    }
  };

  const handleDriverSelect = (driverId: string) => {
    handleStatusUpdate('out_for_delivery', driverId);
  };

  if (!orderId) return null;

  return (
    <>
      <div 
        className={`fixed inset-0 z-50 flex flex-col items-end sm:justify-center safe-inset transition-all duration-300 ${orderId ? 'visible' : 'invisible'}`}
      >
        <div 
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${orderId ? 'opacity-100' : 'opacity-0'}`} 
          onClick={onClose}
        />
        <div 
          className={`relative z-50 h-[92%] sm:h-full w-full sm:w-[500px] bg-card shadow-2xl flex flex-col safe-sheet transform transition-transform duration-300 ease-in-out ${orderId ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0'} rounded-t-[32px] sm:rounded-t-none border-l border-border`}
        >
          {/* Mobile Handle */}
          <div className="sm:hidden flex justify-center py-3 shrink-0">
            <div className="w-12 h-1.5 bg-muted rounded-full" />
          </div>

          <header className="flex items-center justify-between px-6 py-4 sm:py-5 border-b border-border bg-muted/50 dark:bg-muted/50 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-foreground tracking-tight">
                Pedido #{order?.orderNumber || '...'}
              </h2>
              {order && <OrderStatusBadge status={order.status} />}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {order ? `Canal: ${SOURCE_CHANNEL_LABELS[order.sourceChannel as keyof typeof SOURCE_CHANNEL_LABELS] || order.sourceChannel}` : 'Carregando...'}
              </span>
              {isValidating && (
                <span className="flex items-center gap-1 text-[10px] font-black text-primary-500 uppercase animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Sincronizando
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2.5 hover:bg-muted rounded-2xl transition-all active:scale-90"
          >
            <X className="w-6 h-6 text-muted-foreground" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-card">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-primary-600/20 border-t-primary-600 animate-spin" />
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Buscando detalhes...</p>
            </div>
          ) : error ? (
            <div className="bg-destructive/10 p-6 rounded-3xl border border-destructive/20 text-center">
              <p className="text-sm font-bold text-destructive mb-4">{error}</p>
              <button 
                onClick={() => fetchDetail()}
                className="px-6 py-2.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl font-black text-xs uppercase tracking-widest"
              >
                Tentar Novamente
              </button>
            </div>
          ) : order ? (
            <>
              {/* Alerta de Agendamento */}
              {order.isScheduled && order.scheduledFor && (
                <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-4 flex items-center justify-center gap-3 animate-pulse">
                  <div className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar-clock"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></svg>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Entrega/Retirada Programada</p>
                    <p className="text-lg font-black text-foreground">
                      {new Date(order.scheduledFor).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace('-feira', '')}
                    </p>
                  </div>
                </div>
              )}

              {/* Cliente */}
              <OrderCustomerSection 
                customerName={order.customerName}
                customerPhone={order.customerPhone}
                customerEmail={order.customerEmail}
                notes={order.notes}
              />

              {/* Entrega / Fulfillment */}
              <OrderFulfillmentSection 
                fulfillmentType={order.fulfillmentType}
                deliveryAddress={order.deliveryAddress}
                tableNumber={order.tableNumber}
              />

              {/* Entregador (se for entrega) */}
              {order.fulfillmentType === 'delivery' && (
                <OrderDriverSection 
                  driverId={order.deliveryDriverId}
                  driverName={order.deliveryDriverName}
                  driverPhone={order.deliveryDriverPhone}
                  driverStatus={order.deliveryDriverStatus}
                  onAssignDriver={async () => {
                    await fetchDrivers();
                    setIsDriverModalOpen(true);
                  }}
                />
              )}

              {/* Itens */}
              <OrderItemsSection items={order.items} />

              {/* Pagamento e Totais */}
              <OrderPaymentSection 
                itemsSubtotal={order.itemsSubtotal}
                deliveryFee={order.deliveryFee}
                serviceFee={order.serviceFee}
                discountTotal={order.discountTotal}
                total={order.total}
                paymentMethod={order.paymentMethod}
                changeFor={order.changeFor}
                couponCode={order.couponId} // Backend DTO has couponId as string, could be code
                cashbackUsed={order.cashbackUsed}
              />

              {/* Timeline */}
              <OrderTimelineSection timeline={order.timeline} />
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        {order && (
          <OrderActionsBar 
            status={order.status}
            onAdvance={handleAdvance}
            onCancel={() => handleStatusUpdate('cancelled')}
            onPrint={handlePrint}
            onEdit={() => setIsEditModalOpen(true)}
            onRefresh={() => fetchDetail(true)}
            isUpdating={isUpdating}
            isValidating={isValidating}
          />
        )}
      </div>
    </div>

      {/* Modais auxiliares */}
      {isEditModalOpen && order && (
        <EditOrderModal 
          order={order}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={() => {
            setIsEditModalOpen(false);
            fetchDetail(true);
            onUpdated();
          }}
        />
      )}

      {isDriverModalOpen && (
        <DriverSelectionModal 
          isOpen={isDriverModalOpen}
          onClose={() => setIsDriverModalOpen(false)}
          onSelect={handleDriverSelect}
          drivers={drivers}
          isSubmitting={isUpdating}
        />
      )}

      {/* Template de Impressão (invisível na tela, visível no print) */}
      {isPrinting && order && (
        <div className="hidden print:block">
          <OrderPrintTemplate order={order} />
        </div>
      )}
    </>
  );
});
