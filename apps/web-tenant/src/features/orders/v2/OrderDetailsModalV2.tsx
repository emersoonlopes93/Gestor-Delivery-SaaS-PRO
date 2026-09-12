import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ClipboardList, History, PackageOpen, Printer, Radio } from 'lucide-react';
import type { OrderBoardItemDTO, OrderOperationalAction, OrderResponseDTO } from '@gestor/types';
import { api } from '../../../lib/api-client';
import { OrderCustomerSection } from '../components/OrderCustomerSection';
import { OrderFulfillmentSection } from '../components/OrderFulfillmentSection';
import { OrderItemsSection } from '../components/OrderItemsSection';
import { OrderPaymentSection } from '../components/OrderPaymentSection';
import { OrderTimelineSection } from '../components/OrderTimelineSection';
import { ORDER_STATUS_PRESENTATION } from '../order-presenters';
import { ModalShell } from './ModalShell';
import { formatElapsed, isRunnableStatusAction } from './order-manager-v2';

type Props = {
  order: OrderBoardItemDTO | null;
  now: number;
  onClose: () => void;
  onAction: (order: OrderBoardItemDTO, action: OrderOperationalAction) => void;
  onPrint: (order: OrderBoardItemDTO) => void;
  isActionPending: boolean;
  isPrinting: boolean;
};

export function OrderDetailsModalV2({ order, now, onClose, onAction, onPrint, isActionPending, isPrinting }: Props) {
  const [detail, setDetail] = useState<OrderResponseDTO | null>(null);
  const [detailState, setDetailState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [tab, setTab] = useState<'summary' | 'timeline'>('summary');

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

  const title = order?.operational.origin === 'FOOD_99' && order.operational.providerOrderNumber
    ? `Pedido 99Food #${order.operational.providerOrderNumber}`
    : order ? `Pedido #${order.orderNumber}` : 'Pedido';

  return (
    <ModalShell
      open={Boolean(order)}
      title={title}
      onClose={onClose}
      headerActions={order ? <button type="button" disabled={isPrinting} title="Imprimir pedido" aria-label={`Imprimir pedido ${order.orderNumber}`} onClick={() => onPrint(order)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60"><Printer className="h-4 w-4" /></button> : null}
    >
      <div className="p-5 sm:p-6">
        {order ? <section className="mb-5 grid gap-px border border-border bg-border sm:grid-cols-4" aria-label="Resumo operacional do pedido">
          <OperationalSummary label="Status" value={ORDER_STATUS_PRESENTATION[order.status].label} icon={<Activity className="h-3.5 w-3.5" />} />
          <OperationalSummary label="Tempo aberto" value={formatElapsed(order.createdAt, now)} icon={<Radio className="h-3.5 w-3.5" />} />
          <OperationalSummary label="Sincronizacao" value={order.operational.syncState === 'FAILED' ? 'Falha - verificar' : order.operational.syncState === 'PENDING' ? 'Em andamento' : 'Confirmada'} icon={order.operational.syncState === 'FAILED' ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> : <Radio className="h-3.5 w-3.5" />} />
          <OperationalSummary label="Proxima acao" value={order.operational.primaryAction?.label ?? 'Somente consulta'} icon={<ClipboardList className="h-3.5 w-3.5" />} />
        </section> : null}
        {order ? <section className="mb-5 flex flex-wrap gap-2" aria-label="Acoes de status do pedido">
          {order.operational.availableActions.filter(isRunnableStatusAction).map((action) => <button key={action.type} type="button" disabled={isActionPending} onClick={() => onAction(order, action)} className="border border-primary bg-primary px-3 py-2 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">{isActionPending ? 'Atualizando...' : action.label}</button>)}
        </section> : null}
        <div className="mb-6 flex gap-2 border-b border-border">
          <button type="button" onClick={() => setTab('summary')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-black ${tab === 'summary' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}><ClipboardList className="h-4 w-4" />Resumo</button>
          <button type="button" onClick={() => setTab('timeline')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-black ${tab === 'timeline' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}><History className="h-4 w-4" />Timeline</button>
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
  return <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
    <div className="space-y-6">
      <OrderCustomerSection customerName={detail.customerName} customerPhone={detail.customerPhone} customerEmail={detail.customerEmail} missingPhoneMessage={origin === 'FOOD_99' ? 'Não informado pela 99Food' : undefined} />
      <OrderFulfillmentSection fulfillmentType={detail.fulfillmentType} deliveryAddress={detail.deliveryAddress} tableNumber={detail.tableNumber} />
      <OrderItemsSection items={detail.items} />
      <section className="border border-border bg-muted/20 p-4"><h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Observações</h3><p className="mt-2 text-sm text-foreground">{detail.notes || 'Sem observações.'}</p></section>
    </div>
    <aside className="space-y-6">
      <section className="border border-border p-4"><p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Logística</p><p className="mt-2 text-sm font-bold text-foreground">{deliveryLabel}</p><p className="mt-1 text-xs text-muted-foreground">Canal: {channel}</p></section>
      <OrderPaymentSection itemsSubtotal={detail.itemsSubtotal} deliveryFee={detail.deliveryFee} serviceFee={detail.serviceFee} discountTotal={detail.discountTotal} total={detail.total} paymentMethod={detail.paymentMethod} changeFor={detail.changeFor} financialSummary={detail.operational?.financialSummary} />
    </aside>
  </div>;
}

function Timeline({ detail, detailState }: { detail: OrderResponseDTO | null; detailState: 'idle' | 'loading' | 'ready' | 'error' }) {
  return <section className="max-w-xl border border-border bg-muted/15 p-5"><div className="mb-4 flex items-center gap-2 text-sm font-black"><PackageOpen className="h-4 w-4 text-primary" />Linha do tempo somente leitura</div>{detail ? <OrderTimelineSection timeline={detail.timeline} /> : detailState === 'error' ? <p role="alert" className="text-sm font-semibold text-destructive">A timeline não está disponível agora.</p> : <p className="text-sm text-muted-foreground">Carregando timeline…</p>}</section>;
}

function OperationalSummary({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="bg-card px-3 py-3"><p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">{icon}{label}</p><p className="mt-1.5 text-xs font-black text-foreground">{value}</p></div>;
}
