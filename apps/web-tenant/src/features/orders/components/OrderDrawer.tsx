import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { AlertCircle, Clock3, MapPinned, Route, X, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryRunBuilderDataDTO, DeliveryRunDTO, OrderOperationalAction, OrderResponseDTO, UpdateOrderStatusDTO, DriverDTO } from '@gestor/types';
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
import { OrderTrackingDialog } from './OrderTrackingDialog';
import { orderBelongsToRun } from '../../delivery/tracking-map.utils';
import { Capacitor } from '@capacitor/core';
import { printTicketViaPrimaryBluetooth } from '../../../lib/bluetooth';
import { printThermalText } from '../../../lib/thermal-print';
import toast from 'react-hot-toast';
import { buildRoutingSummary, formatOrderNumber, presentOrderTime, providerLabel, resolveOrderPriority } from '../order-presenters';
import { subscribeOrdersRealtimeEvents } from '../../../notifications/ordersRealtimeEvents';

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
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const trackingRunQuery = useQuery({
    queryKey: ['delivery-run', 'order', order?.id],
    enabled: Boolean(order?.id && order.fulfillmentType === 'delivery' && order.operational?.deliveryOwnership === 'MERCHANT'),
    queryFn: async () => (await api.get<DeliveryRunDTO | null>(`/delivery/runs/order/${order?.id}`)).data ?? null,
  });
  const routingSummary = order ? buildRoutingSummary(trackingRunQuery.data, order.id) : null;
  const canTrackOrder = Boolean(order && orderBelongsToRun(order, trackingRunQuery.data));
  const assignDriverAction = order?.operational?.availableActions.find((candidate) => candidate.type === 'ASSIGN_DRIVER' && candidate.enabled);
  const primaryAction = order?.operational?.primaryAction ?? null;
  const priority = order?.operational
    ? resolveOrderPriority({
      status: order.status,
      createdAt: order.createdAt,
      isScheduled: order.isScheduled ?? false,
      deliveryDriverName: order.deliveryDriverName ?? undefined,
      operational: order.operational,
    }, Date.now(), { status: order.status, timeline: order.timeline })
    : null;
  const orderTime = order
    ? presentOrderTime(order.createdAt, Date.now(), { status: order.status, timeline: order.timeline })
    : null;
  const closeTracking = useCallback(() => setIsTrackingOpen(false), []);

  useEffect(() => {
    if (!orderId) return;
    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => restoreFocus?.focus());
    };
  }, [onClose, orderId]);

  const fetchDetail = useCallback(async (quiet = false) => {
    if (!orderId) return;
    if (!quiet) setLoading(true);
    else setIsValidating(true);
    
    setError('');
    try {
      const res = await api.get<OrderResponseDTO>(`/orders/${orderId}?detail=${Date.now()}`);
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

  useEffect(() => subscribeOrdersRealtimeEvents((event) => {
    if (event.type === 'order.changed' && event.hint.orderId === orderId) {
      void fetchDetail(true);
    }
  }), [fetchDetail, orderId]);

  const fetchDrivers = async () => {
    try {
      const res = await api.get<DeliveryRunBuilderDataDTO>('/delivery/runs/builder');
      setDrivers(res.data?.drivers || []);
    } catch (err) {
      console.error('[OrderDrawer] Erro ao buscar entregadores:', err);
    }
  };

  const handleOperationalAction = async (action: OrderOperationalAction, driverId?: string) => {
    if (!order || isUpdating) return;
    if (!action.enabled) {
      toast(action.reason ?? 'Ação indisponível para este pedido.');
      return;
    }
    if (action.type === 'PRINT') { await handlePrint(); return; }
    if (action.type === 'EDIT') { setIsEditModalOpen(true); return; }

    if ((action.type === 'ASSIGN_DRIVER' || action.type === 'DISPATCH') && !driverId) {
      if (order.operational?.deliveryOwnership !== 'MERCHANT') {
        toast(order.operational?.deliverySummary.label ?? 'A entrega não permite frota própria.');
        return;
      }
      await fetchDrivers();
      setIsDriverModalOpen(true);
      return;
    }

    setIsUpdating(true);
    try {
      if (driverId) {
        await api.post('/delivery/runs', { driverId, orderIds: [order.id] });
        toast.success('Rota criada; o entregador deve aceitar e iniciar a entrega.');
        await fetchDetail(true);
        onUpdated();
        return;
      }

      if (!action.targetStatus) return;
      const body: UpdateOrderStatusDTO = { status: action.targetStatus };
      const res = await api.patch<OrderResponseDTO>(`/orders/${order.id}/status`, body);
      
      if (res.success) {
        toast.success(
          action.mode === 'PROVIDER_ASYNC'
            ? `Solicitação enviada. Sincronizando com ${order.operational?.displayChannel ?? 'marketplace'}.`
            : `${action.label} concluído.`,
        );
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
      printThermalText(printRes.data.content, { title: `Pedido ${formatOrderNumber(order.orderNumber)}`, paperWidthMm: 58 });
      setIsPrinting(false);
      toast.success('Imprimindo...');
      fetchDetail(true);
    } catch (err) {
      console.error('[OrderDrawer] Erro ao registrar impressao:', err);
      setIsPrinting(false);
    }
  };

  const handleDriverSelect = (driverId: string) => {
    const dispatchAction = order?.operational?.availableActions.find((candidate) => candidate.type === 'DISPATCH');
    if (dispatchAction) handleOperationalAction(dispatchAction, driverId);
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
          aria-hidden="true"
        />
        <div 
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-drawer-title"
          className={`relative z-50 h-[92%] sm:h-full w-full sm:w-[500px] bg-card shadow-2xl flex flex-col safe-sheet transform transition-transform duration-300 ease-in-out ${orderId ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0'} rounded-t-[32px] sm:rounded-t-none border-l border-border`}
        >
          {/* Mobile Handle */}
          <div className="sm:hidden flex justify-center py-3 shrink-0">
            <div className="w-12 h-1.5 bg-muted rounded-full" />
          </div>

          <header className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-5 border-b border-border bg-muted/50 dark:bg-muted/50 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div>
                <h2 id="order-drawer-title" className="text-xl font-black text-foreground tracking-tight">
                  {order?.operational?.origin === 'FOOD_99' && order.operational.providerOrderNumber
                    ? `Pedido 99Food #${order.operational.providerOrderNumber}`
                    : `Pedido ${formatOrderNumber(order?.orderNumber || '...')}`}
                </h2>
                {order?.operational?.origin === 'FOOD_99' && order.operational.providerOrderNumber ? (
                  <p className="text-xs font-bold text-muted-foreground">PedeHub {formatOrderNumber(order.orderNumber)}</p>
                ) : null}
              </div>
              {order && <OrderStatusBadge status={order.status} />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {order?.operational ? providerLabel(order.operational) : order?.sourceChannel ?? 'Carregando...'}
              </span>
              {orderTime ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Clock3 className="h-3 w-3" />{orderTime.label}</span> : null}
              {priority ? <span className="text-xs font-black text-foreground">{priority.label}</span> : null}
              {isValidating && (
                <span className="flex items-center gap-1 text-[10px] font-black text-primary-500 uppercase animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Sincronizando
                </span>
              )}
            </div>
          </div>
          <button 
            ref={closeButtonRef}
            onClick={onClose} 
            className="p-2.5 hover:bg-muted rounded-2xl transition-all active:scale-90"
            aria-label="Fechar detalhes do pedido"
          >
            <X className="w-6 h-6 text-muted-foreground" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 bg-card p-4 sm:space-y-8 sm:p-6">
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
              {order.operational && order.operational.marketplaceOperation.state !== 'NONE' ? (
                <div role="status" className={`flex gap-3 rounded-xl border p-4 ${order.operational.marketplaceOperation.state === 'FAILED' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-primary/30 bg-primary/10 text-primary'}`}>
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm font-bold">{order.operational.marketplaceOperation.friendlyMessage}</p>
                </div>
              ) : null}
              {primaryAction ? (
                <button type="button" onClick={() => handleOperationalAction(primaryAction)} disabled={isUpdating} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60">
                  {isUpdating ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {primaryAction.label}
                </button>
              ) : null}
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

              <OrderItemsSection items={order.items} />

              {/* Entrega / Fulfillment */}
              <section className="rounded-xl border border-border bg-background p-4" aria-label="Produção">
                <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Produção</p>
                <p className="mt-1 text-sm font-bold text-foreground">{order.operational?.productionSummary.label ?? 'Estado da produção não confirmado'}</p>
              </section>

              <OrderFulfillmentSection 
                fulfillmentType={order.fulfillmentType}
                deliveryAddress={order.deliveryAddress}
                tableNumber={order.tableNumber}
              />

              {/* Entregador (se for entrega) */}
              {order.fulfillmentType === 'delivery' && (
                <div className="space-y-3">
                  {order.operational?.deliveryOwnership === 'MERCHANT' && (order.deliveryDriverId || assignDriverAction) ? (
                    <OrderDriverSection
                      fulfillmentType={order.fulfillmentType}
                      driverId={order.deliveryDriverId}
                      driverName={order.deliveryDriverName}
                      driverPhone={order.deliveryDriverPhone}
                      driverStatus={order.deliveryDriverStatus}
                      onAssignDriver={async () => {
                        if (assignDriverAction) await handleOperationalAction(assignDriverAction);
                      }}
                    />
                  ) : (
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Logística</p>
                      <p className="mt-2 text-sm font-bold text-foreground">{order.operational?.deliverySummary.label}</p>
                    </div>
                  )}
                   {routingSummary ? (
                    <div className="rounded-xl border border-border bg-muted/35 p-4 text-sm">
                      <p className="flex items-center gap-2 font-black text-foreground"><Route className="h-4 w-4 text-primary" />{routingSummary.stopPosition} · {routingSummary.runState}</p>
                      <p className="mt-1 font-semibold text-muted-foreground">{routingSummary.driver}{routingSummary.eta ? ` · chegada ${routingSummary.eta}` : ''}{routingSummary.metrics ? ` · ${routingSummary.metrics}` : ''}</p>
                      {routingSummary.qualityMessage ? <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-300">{routingSummary.qualityMessage}</p> : null}
                     </div>
                   ) : null}
                   {canTrackOrder ? (
                     <button
                       type="button"
                       onClick={() => setIsTrackingOpen(true)}
                       className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-black text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                     >
                       <MapPinned className="h-4 w-4" /> Ver no mapa
                     </button>
                   ) : null}
                 </div>
              )}

              {/* Pagamento e Totais */}
              <OrderPaymentSection 
                itemsSubtotal={order.itemsSubtotal}
                deliveryFee={order.deliveryFee}
                serviceFee={order.serviceFee}
                discountTotal={order.discountTotal}
                total={order.total}
                financialSummary={order.operational?.financialSummary}
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
        {order?.operational && (
          <OrderActionsBar 
            operational={order.operational}
            onAction={handleOperationalAction}
            onRefresh={() => fetchDetail(true)}
            isUpdating={isUpdating}
            isValidating={isValidating}
            showPrimary={false}
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

       {isTrackingOpen && order && canTrackOrder ? (
         <OrderTrackingDialog order={order} initialRun={trackingRunQuery.data ?? undefined} onClose={closeTracking} />
       ) : null}

       {/* Template de Impressão (invisível na tela, visível no print) */}
      {isPrinting && order && (
        <div className="hidden print:block">
          <OrderPrintTemplate order={order} />
        </div>
      )}
    </>
  );
});
