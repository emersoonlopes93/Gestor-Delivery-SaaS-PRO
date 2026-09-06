import { memo, useState } from 'react';
import { Clock, ArrowRight, User, MoreVertical, FileText, ShoppingBag, MapPin } from 'lucide-react';
import type { OrderBoardItemDTO, OrderOperationalAction, OrderStatus } from '@gestor/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Novo', confirmed: 'Confirmado', preparing: 'Em Preparo',
  ready_for_pickup: 'Pronto / Retirada', ready_for_delivery: 'Pronto / Entrega',
  out_for_delivery: 'Em Rota', completed: 'Concluído', cancelled: 'Cancelado', draft: 'Rascunho',
};

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: 'status-badge-pending', confirmed: 'status-badge-confirmed', preparing: 'status-badge-preparing',
  ready_for_pickup: 'status-badge-success', ready_for_delivery: 'status-badge-success',
  out_for_delivery: 'status-badge-indigo', completed: 'status-badge-neutral',
  cancelled: 'status-badge-danger', draft: 'status-badge-neutral',
};

export const StatusBadge = memo(function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge-premium ${STATUS_TONE[status]}`}>{STATUS_LABELS[status]}</span>;
});

export const TimerBadge = memo(function TimerBadge({ minutes, compact }: { minutes: number; compact: boolean }) {
  const overdue = minutes > 30;
  const warning = minutes >= 15 && !overdue;
  const badgeColorClass = overdue
    ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400 ring-rose-500/20'
    : warning
      ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 ring-amber-500/20'
      : 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 ring-emerald-500/20';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black ring-1 ${badgeColorClass}`}>
      <span aria-hidden="true">{overdue ? '🔴' : warning ? '🟡' : '🟢'}</span>
      <Clock className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
      <span>{minutes} min</span>
    </span>
  );
});

export interface OrderCardProps {
  order: OrderBoardItemDTO;
  compact: boolean;
  updating: boolean;
  onAction: (orderId: string, action: OrderOperationalAction) => void;
  onClick: (orderId: string) => void;
  elapsedMin: number;
  formattedValue: string;
}

export const OrderCard = memo(function OrderCard({
  order, compact, updating, onAction, onClick, elapsedMin, formattedValue,
}: OrderCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: order.id,
    data: { type: 'Order', order },
  });
  const operational = order.operational;
  const primaryAction = operational.primaryAction;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative border border-border bg-background rounded-[24px] shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.005] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isDragging ? 'opacity-40 z-50 ring-2 ring-primary scale-105 cursor-grabbing' : 'cursor-grab hover:border-primary/30'}`}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Abrir detalhes do pedido ${order.orderNumber}`}
      onClick={() => { if (!isDragging) onClick(order.id); }}
      onKeyDown={(event) => { if (event.key === 'Enter') onClick(order.id); }}
    >
      <div className={compact ? 'p-2.5 md:p-3' : 'p-3.5 md:p-4 xl:p-5'}>
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <span className={`font-black text-foreground ${compact ? 'text-xs md:text-sm' : 'text-base'} bg-muted px-2.5 py-1 rounded-lg border border-border`}>
            #{order.orderNumber}
          </span>
          <TimerBadge minutes={elapsedMin} compact={compact} />
        </div>

        {operational.marketplaceOperation.state !== 'NONE' && (
          <div className={`mb-3 rounded-xl border px-3 py-2 text-[10px] font-black ${operational.marketplaceOperation.state === 'FAILED' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-primary/30 bg-primary/10 text-primary'}`}>
            {operational.marketplaceOperation.friendlyMessage}
          </div>
        )}

        <div className="min-w-0 mb-3 space-y-1.5">
          <h3 className={`font-black text-foreground leading-snug flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate">{order.customerName}</span>
          </h3>
          <p className="text-muted-foreground flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{operational.displayChannel} · {operational.deliverySummary.label}</span>
          </p>
          {operational.deliverySummary.ownership === 'MERCHANT' && operational.deliverySummary.driverName && (
            <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Motoboy: {operational.deliverySummary.driverName}</p>
          )}
        </div>

        <div className="space-y-2.5 pt-2.5 border-t border-border/40">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={order.status} />
            <span className="font-black text-foreground text-sm" title={operational.financialSummary.operationalValueLabel}>
              {operational.financialSummary.operationalValueLabel}: {formattedValue}
            </span>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground">{operational.productionSummary.label}</p>
          <div className="rounded-xl px-3 py-2 bg-muted/40 border border-border/45 flex items-start gap-2">
            <ShoppingBag className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[10px] md:text-[11px] text-foreground font-medium leading-relaxed">
              <strong className="text-primary mr-1">{order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}:</strong>
              <span className="text-muted-foreground italic">{order.itemsSummary}</span>
            </p>
          </div>
          {!compact && order.notes && (
            <div className="rounded-xl px-3 py-2 bg-amber-500/5 border border-amber-500/15 flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] md:text-[11px] text-amber-600 dark:text-amber-400 font-semibold">Obs: {order.notes}</p>
            </div>
          )}
        </div>

        <div className="relative mt-3 pt-2.5 border-t border-border/40 flex items-center gap-2">
          {primaryAction ? (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onAction(order.id, primaryAction); }}
              onPointerDown={(event) => event.stopPropagation()}
              disabled={updating}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl font-black uppercase tracking-wider text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
            >
              {primaryAction.label}<ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <div className="flex-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-center">
              {operational.syncState === 'PENDING' ? 'Aguardando sincronização' : 'Sem ação pendente'}
            </div>
          )}
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); setMenuOpen((current) => !current); }}
            onPointerDown={(event) => event.stopPropagation()}
            className="w-9 h-9 rounded-xl bg-secondary text-secondary-foreground border border-border/50 flex items-center justify-center"
            aria-label="Abrir ações secundárias"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute bottom-11 right-0 z-20 min-w-40 rounded-xl border border-border bg-card p-1.5 shadow-xl">
              {operational.secondaryActions.map((secondary) => (
                <button
                  key={secondary.type}
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setMenuOpen(false); onAction(order.id, secondary); }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-foreground hover:bg-muted"
                >
                  {secondary.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
