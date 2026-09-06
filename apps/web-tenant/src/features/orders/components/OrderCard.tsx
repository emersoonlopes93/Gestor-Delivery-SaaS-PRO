import { memo } from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, Clock3, FileText, Info, ShoppingBag, User } from 'lucide-react';
import type { OrderBoardItemDTO, OrderOperationalAction } from '@gestor/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { deliveryStatement, presentOrderTime, providerLabel, resolveOrderPriority } from '../order-presenters';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderActionMenu } from './OrderActionMenu';

export interface OrderCardProps {
  order: OrderBoardItemDTO;
  compact: boolean;
  updating: boolean;
  onAction: (orderId: string, action: OrderOperationalAction) => void;
  onClick: (orderId: string) => void;
  elapsedMin: number;
  formattedValue: string;
}

const priorityStyles = {
  critical: 'border-destructive/35 bg-destructive/5 text-destructive',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  info: 'border-primary/35 bg-primary/10 text-primary',
  normal: 'border-border bg-muted/40 text-muted-foreground',
} as const;

function PriorityIcon({ level }: { level: ReturnType<typeof resolveOrderPriority>['level'] }) {
  if (level === 'critical') return <AlertCircle className="h-3.5 w-3.5" />;
  if (level === 'warning') return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Info className="h-3.5 w-3.5" />;
}

export const OrderCard = memo(function OrderCard({
  order, compact, updating, onAction, onClick, formattedValue,
}: OrderCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: order.id,
    data: { type: 'Order', order },
  });
  const priority = resolveOrderPriority(order);
  const time = presentOrderTime(order.createdAt);
  const operational = order.operational;
  const primaryAction = operational.primaryAction;

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative overflow-visible rounded-2xl border bg-card shadow-sm transition hover:border-primary/35 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/40 ${isDragging ? 'z-50 opacity-40 ring-2 ring-primary' : ''}`}
    >
      <button
        type="button"
        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={`Abrir detalhes do pedido ${order.orderNumber}`}
        onClick={() => onClick(order.id)}
        {...attributes}
        {...listeners}
      />

      <div className={compact ? 'pointer-events-none relative p-3' : 'pointer-events-none relative p-4'}>
        <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
          <div className="min-w-0 space-y-2">
            <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${priorityStyles[priority.level]}`}>
              <PriorityIcon level={priority.level} /><span>{priority.label}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" /><span>{time.label}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-black leading-none text-foreground">#{order.orderNumber}</p>
            <span className="mt-1.5 inline-flex rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-black text-foreground">{providerLabel(operational)}</span>
          </div>
        </div>

        <div className="space-y-2.5 border-b border-border py-3">
          <OrderStatusBadge status={order.status} />
          <h3 className="flex items-center gap-2 text-sm font-black text-foreground"><User className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{order.customerName}</span></h3>
          <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShoppingBag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="line-clamp-2"><strong className="text-foreground">{order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}</strong> · {order.itemsSummary}</p>
          </div>
          {!compact && order.notes ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="line-clamp-2">{order.notes}</span>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border py-3 text-xs">
          <div>
            <p className="font-black text-foreground">{deliveryStatement(operational, order.fulfillmentType)}</p>
            {operational.productionSummary.state !== 'UNKNOWN' ? <p className="mt-1 font-medium text-muted-foreground">KDS · {operational.productionSummary.label}</p> : null}
          </div>
          <p className="self-center whitespace-nowrap font-black text-foreground">Venda: {formattedValue}</p>
        </div>

        {operational.marketplaceOperation.state !== 'NONE' ? (
          <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${operational.marketplaceOperation.state === 'FAILED' ? priorityStyles.critical : priorityStyles.info}`}>{operational.marketplaceOperation.friendlyMessage}</div>
        ) : null}

        <div className="pointer-events-auto relative mt-3 flex items-center gap-2">
          {primaryAction ? (
            <button type="button" onClick={() => onAction(order.id, primaryAction)} disabled={updating} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60">
              {primaryAction.label}<ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button type="button" onClick={() => onClick(order.id)} className="min-h-10 flex-1 rounded-lg border border-border bg-muted px-3 text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Abrir detalhes</button>
          )}
          <OrderActionMenu label="Abrir ações secundárias" actions={operational.secondaryActions} onAction={(action) => onAction(order.id, action)} />
        </div>
      </div>
    </article>
  );
});
