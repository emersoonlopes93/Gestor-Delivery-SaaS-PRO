import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ClipboardList, History, PackageOpen, Printer, Radio } from 'lucide-react';
import { DeliveryStopStatus, type DeliveryRunDTO, type OrderBoardItemDTO, type OrderOperationalAction, type OrderResponseDTO } from '@gestor/types';
import { api } from '../../../lib/api-client';
import { OrderCustomerSection } from '../components/OrderCustomerSection';
import { OrderFulfillmentSection } from '../components/OrderFulfillmentSection';
import { OrderItemsSection } from '../components/OrderItemsSection';
import { OrderPaymentSection } from '../components/OrderPaymentSection';
import { OrderTimelineSection } from '../components/OrderTimelineSection';
import { ORDER_STATUS_PRESENTATION } from '../order-presenters';
import { ModalShell } from './ModalShell';
import { formatElapsed, formatOrderDisplayNumber, getProviderOrderNumber, isRunnableStatusAction } from './order-manager-v2';

type Props = {
  order: OrderBoardItemDTO | null;
  now: number;
  onClose: () => void;
  onAction: (order: OrderBoardItemDTO, action: OrderOperationalAction) => void;
  onPrint: (order: OrderBoardItemDTO) => void;
  onManualDeliveryCompleted: (order: OrderBoardItemDTO) => void;
  isActionPending: boolean;
  isPrinting: boolean;
};

const MANUAL_DELIVERY_REASONS = [
  { code: 'customer_confirmation', label: 'Cliente confirmou o recebimento' },
  { code: 'courier_unavailable', label: 'Entregador indisponível para concluir' },
  { code: 'operational_correction', label: 'Correção operacional autorizada' },
  { code: 'other', label: 'Outro motivo' },
] as const;

export function OrderDetailsModalV2({ order, now, onClose, onAction, onPrint, onManualDeliveryCompleted, isActionPending, isPrinting }: Props) {
  const [detail, setDetail] = useState<OrderResponseDTO | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [tab, setTab] = useState<'summary' | 'timeline'>('summary');
  const [deliveryRun, setDeliveryRun] = useState<DeliveryRunDTO | null>(null);
  const [manualReason, setManualReason] = useState<(typeof MANUAL_DELIVERY_REASONS)[number]['code']>('customer_confirmation');
  const [manualNote, setManualNote] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPending, setManualPending] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    if (!order) {
      setDetailState('idle');
      return;
    }
    setDetailState('loading');
    void api.get<OrderResponseDTO>(`/orders/${order.id}`)
      .then((response) => {
        setDetail(response.data ?? null);
        setDetailState(response.data ? 'ready' : 'error');
      })
      .catch(() => {
        setDetail(null);
        setDetailState('error');
      });
  }, [order]);

  useEffect(() => {
    setDeliveryRun(null);
    setManualOpen(false);
    setManualError(null);
    if (!order || order.status !== 'out_for_delivery' || order.operational.deliveryOwnership !== 'MERCHANT') return;
    void api.get<DeliveryRunDTO | null>(`/delivery/runs/order/${order.id}`)
      .then((response) => setDeliveryRun(response.data ?? null))
      .catch(() => setDeliveryRun(null));
  }, [order]);

  const manualStop = deliveryRun?.stops.find((stop) => stop.orderId === order?.id);
  const canCompleteManually = Boolean(manualStop && (manualStop.status === DeliveryStopStatus.CURRENT || manualStop.status === DeliveryStopStatus.ARRIVED));
  const selectedReason = MANUAL_DELIVERY_REASONS.find((reason) => reason.code === manualReason) ?? MANUAL_DELIVERY_REASONS[0];
  const submitManualCompletion = async () => {
    if (!order || !deliveryRun || !manualStop || manualPending) return;
    const note = manualNote.trim();
    if (manualReason === 'other' && !note) {
      setManualError('Descreva o motivo da conclusão manual.');
      return;
    }
    setManualPending(true);
    setManualError(null);
    try {
      const reason = `[manager_manual:${selectedReason.code}] ${selectedReason.label}${note ? ` — ${note}` : ''}`;
      const response = await api.post<DeliveryRunDTO>(`/delivery/runs/${deliveryRun.id}/stops/${manualStop.id}/complete-manually`, { reason });
      if (!response.success) throw new Error('Conclusão manual não confirmada.');
      setDeliveryRun(response.data ?? null);
      setManualOpen(false);
      onManualDeliveryCompleted(order);
    } catch {
      setManualError('Não foi possível concluir manualmente. O pedido será reconciliado antes de uma nova tentativa.');
      onManualDeliveryCompleted(order);
    } finally {
      setManualPending(false);
    }
  };

  const providerNumber = order ? getProviderOrderNumber(order) : null;
  const runnableActions = order?.operational.availableActions.filter(isRunnableStatusAction) ?? [];
  const primaryAction = isRunnableStatusAction(order?.operational.primaryAction)
    ? order.operational.primaryAction : runnableActions[0];
  const otherActions = runnableActions.filter((action) => action.type !== primaryAction?.type);
  const title = order ? providerNumber
    ? `Pedido ${order.operational.displayChannel} ${formatOrderDisplayNumber(providerNumber)}`
    : order.operational.origin !== 'PEDEHUB' ? `Pedido PedeHub ${formatOrderDisplayNumber(order.orderNumber)}` : `Pedido ${formatOrderDisplayNumber(order.orderNumber)}` : 'Pedido';

  return (
    <ModalShell
      open={Boolean(order)}
      title={title}
      onClose={onClose}
      headerActions={order ? <button type="button" disabled={isPrinting} title="Imprimir pedido" aria-label={`Imprimir pedido ${order.orderNumber}`} onClick={() => onPrint(order)} className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60"><Printer className="h-4 w-4" /></button> : null}
    >
      <div className="p-4 sm:p-6">
        {order && order.operational.origin !== 'PEDEHUB' ? <p className="mb-4 text-xs font-semibold text-muted-foreground">{providerNumber ? `Referência PedeHub ${formatOrderDisplayNumber(order.orderNumber)}` : 'Número da plataforma não informado'}</p> : null}
        {order ? <section className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Resumo operacional do pedido">
          <div><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Activity className="h-4 w-4" /> Status atual</p><p className="mt-1 text-lg font-black text-foreground">{ORDER_STATUS_PRESENTATION[order.status].label}</p><p className="mt-1 text-xs text-muted-foreground">Proxima acao: {primaryAction?.label ?? 'Somente consulta'}</p></div>
          {primaryAction ? <button type="button" disabled={isActionPending} onClick={() => onAction(order, primaryAction)} className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60 sm:w-auto">{isActionPending ? 'Atualizando...' : primaryAction.label}</button> : null}
        </section> : null}
        {order ? <section className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-label="Diagnóstico do pedido">
          <span className="inline-flex items-center gap-1"><Radio className="h-3.5 w-3.5" />{formatElapsed(order.createdAt, now)}</span>
          {order.operational.syncState !== 'NONE' ? <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold ${order.operational.syncState === 'FAILED' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}><AlertTriangle className="h-3.5 w-3.5" />{order.operational.syncState === 'FAILED' ? 'Falha de sincronização' : 'Sincronização em andamento'}</span> : null}
        </section> : null}
        {order ? <section className="mb-5 flex flex-wrap gap-2" aria-label="Acoes de status do pedido">
          {otherActions.map((action) => <button key={action.type} type="button" disabled={isActionPending} onClick={() => onAction(order, action)} className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-black text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60">{isActionPending ? 'Atualizando...' : action.label}</button>)}
          {canCompleteManually ? <button type="button" disabled={isActionPending || manualPending} onClick={() => setManualOpen(true)} className="border border-amber-600 bg-amber-500 px-3 py-2 text-xs font-black text-amber-950 hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60">Marcar como entregue</button> : null}
        </section> : null}
        {manualOpen ? <section className="mb-5 border border-amber-500/50 bg-amber-500/10 p-4" aria-label="Confirmação de entrega manual">
          <h3 className="text-sm font-black text-foreground">Confirmar entrega manual</h3>
          <p className="mt-1 text-xs text-muted-foreground">Esta ação conclui o pedido, registra o gestor responsável e atualiza a rota.</p>
          <label className="mt-3 block text-xs font-bold text-foreground">Motivo<select value={manualReason} disabled={manualPending} onChange={(event) => setManualReason(event.target.value as typeof manualReason)} className="mt-1 block w-full border border-border bg-background px-3 py-2 text-sm"><option value="customer_confirmation">Cliente confirmou o recebimento</option><option value="courier_unavailable">Entregador indisponível para concluir</option><option value="operational_correction">Correção operacional autorizada</option><option value="other">Outro motivo</option></select></label>
          <label className="mt-3 block text-xs font-bold text-foreground">Observação{manualReason === 'other' ? ' (obrigatória)' : ' (opcional)'}<textarea value={manualNote} disabled={manualPending} onChange={(event) => setManualNote(event.target.value)} maxLength={120} className="mt-1 block min-h-20 w-full border border-border bg-background px-3 py-2 text-sm" /></label>
          {manualError ? <p role="alert" className="mt-2 text-xs font-bold text-destructive">{manualError}</p> : null}
          <div className="mt-4 flex gap-2"><button type="button" disabled={manualPending} onClick={() => setManualOpen(false)} className="border border-border px-3 py-2 text-xs font-black">Cancelar</button><button type="button" disabled={manualPending} onClick={() => void submitManualCompletion()} className="bg-primary px-3 py-2 text-xs font-black text-primary-foreground disabled:opacity-60">{manualPending ? 'Concluindo...' : 'Confirmar entrega'}</button></div>
        </section> : null}
        <div className="mb-5 flex gap-2 border-b border-border" aria-label="Detalhes do pedido">
          <button type="button" aria-pressed={tab === 'summary'} onClick={() => setTab('summary')} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tab === 'summary' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}><ClipboardList className="h-4 w-4" />Pedido</button>
          <button type="button" aria-pressed={tab === 'timeline'} onClick={() => setTab('timeline')} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tab === 'timeline' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}><History className="h-4 w-4" />Histórico</button>
        </div>
        {tab === 'summary' ? <Summary detail={detail} detailState={detailState} origin={order?.operational.origin} deliveryLabel={order?.operational.deliverySummary.label} channel={order?.operational.displayChannel} /> : <Timeline detail={detail} detailState={detailState} />}
      </div>
    </ModalShell>
  );
}

function Summary({ detail, detailState, origin, deliveryLabel, channel }: { detail: OrderResponseDTO | null; detailState: 'idle' | 'loading' | 'ready' | 'error'; origin?: OrderBoardItemDTO['operational']['origin']; deliveryLabel?: string; channel?: string }) {
  if (!detail) return detailState === 'error'
    ? <p role="alert" className="text-sm font-semibold text-destructive">Os detalhes não estão disponíveis agora. O contexto do quadro foi preservado.</p>
    : <p className="text-sm text-muted-foreground">Carregando detalhes do pedido…</p>;
  return <div className="space-y-6">
    <section aria-label="Cliente e entrega" className="grid gap-5 border-b border-border pb-6 md:grid-cols-2">
      <OrderCustomerSection customerName={detail.customerName} customerPhone={detail.customerPhone} customerEmail={detail.customerEmail} missingPhoneMessage={origin === 'FOOD_99' ? 'Não informado pela 99Food' : undefined} />
      <div className="space-y-4"><OrderFulfillmentSection fulfillmentType={detail.fulfillmentType} deliveryAddress={detail.deliveryAddress} tableNumber={detail.tableNumber} /><section className="border border-border bg-muted/20 p-4"><p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Responsável pela entrega</p><p className="mt-2 text-sm font-bold text-foreground">{deliveryLabel}</p><p className="mt-1 text-xs text-muted-foreground">Canal: {channel}</p></section></div>
    </section>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,.8fr)]">
      <OrderItemsSection items={detail.items} />
      <OrderPaymentSection itemsSubtotal={detail.itemsSubtotal} deliveryFee={detail.deliveryFee} serviceFee={detail.serviceFee} discountTotal={detail.discountTotal} total={detail.total} paymentMethod={detail.paymentMethod} changeFor={detail.changeFor} financialSummary={detail.operational?.financialSummary} origin={origin} />
    </div>
    <section className="border border-border bg-muted/20 p-4"><h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Observações</h3><p className="mt-2 text-sm text-foreground">{detail.notes || 'Sem observações.'}</p></section>
  </div>;
}

function Timeline({ detail, detailState }: { detail: OrderResponseDTO | null; detailState: 'idle' | 'loading' | 'ready' | 'error' }) {
  return <section className="max-w-xl border border-border bg-muted/15 p-5"><div className="mb-4 flex items-center gap-2 text-sm font-black"><PackageOpen className="h-4 w-4 text-primary" />Linha do tempo somente leitura</div>{detail ? <OrderTimelineSection timeline={detail.timeline} /> : detailState === 'error' ? <p role="alert" className="text-sm font-semibold text-destructive">A timeline não está disponível agora.</p> : <p className="text-sm text-muted-foreground">Carregando timeline…</p>}</section>;
}
