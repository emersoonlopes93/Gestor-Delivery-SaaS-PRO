import { memo } from 'react';
import { Clock, ArrowRight, User, Printer, Eye, Edit2, FileText, DollarSign, ShoppingBag, MapPin } from 'lucide-react';
import { SOURCE_CHANNEL_LABELS, type OrderBoardItemDTO, type OrderStatus } from '@gestor/types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/* ─── Labels ────────────────────────────────────────────────── */

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Novo',
  confirmed: 'Confirmado',
  preparing: 'Em Preparo',
  ready_for_pickup: 'Pronto / Retirada',
  ready_for_delivery: 'Pronto / Entrega',
  out_for_delivery: 'Em Rota',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  draft: 'Rascunho',
};

type StatusTone = {
  cls: string;
  dot?: string;
};

const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  pending: { cls: 'status-badge-pending', dot: 'bg-amber-400' },
  confirmed: { cls: 'status-badge-confirmed', dot: 'bg-blue-400' },
  preparing: { cls: 'status-badge-preparing', dot: 'bg-orange-400' },
  ready_for_pickup: { cls: 'status-badge-success', dot: 'bg-emerald-400' },
  ready_for_delivery: { cls: 'status-badge-success', dot: 'bg-emerald-400' },
  out_for_delivery: { cls: 'status-badge-indigo', dot: 'bg-violet-400' },
  completed: { cls: 'status-badge-neutral', dot: 'bg-slate-400' },
  cancelled: { cls: 'status-badge-danger', dot: 'bg-red-400' },
  draft: { cls: 'status-badge-neutral', dot: 'bg-slate-300' },
};

export const StatusBadge = memo(function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={`badge-premium ${tone.cls}`}>
      {STATUS_LABELS[status]}
    </span>
  );
});

export const TimerBadge = memo(function TimerBadge({ minutes, compact }: { minutes: number; compact: boolean }) {
  let indicator = '🟢';
  let badgeColorClass = 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 ring-emerald-500/20';
  
  if (minutes > 30) {
    indicator = '🔴';
    badgeColorClass = 'bg-rose-500/10 text-rose-500 dark:text-rose-400 ring-rose-500/20';
  } else if (minutes >= 15) {
    indicator = '🟡';
    badgeColorClass = 'bg-amber-500/10 text-amber-500 dark:text-amber-400 ring-amber-500/20';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black ring-1 ${badgeColorClass}`}
    >
      <span>{indicator}</span>
      <Clock className={compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
      <span>{minutes} min</span>
    </span>
  );
});

export interface OrderCardProps {
  order: OrderBoardItemDTO;
  compact: boolean;
  updating: boolean;
  onAdvance: (orderId: string, nextStatus: OrderStatus) => void;
  onClick: (orderId: string) => void;
  onPrint?: (orderId: string) => void;
  onEdit?: (orderId: string) => void;
  nextStatus: OrderStatus | null;
  elapsedMin: number;
  totalLabel: string;
}

export const OrderCard = memo(function OrderCard(props: OrderCardProps) {
  const { order, compact, updating, onAdvance, onClick, onPrint, onEdit, nextStatus, elapsedMin, totalLabel } = props;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: order.id,
    data: {
      type: 'Order',
      order,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative border border-border bg-background rounded-[24px] shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.005] ${isDragging ? 'opacity-40 z-50 ring-2 ring-primary scale-105 cursor-grabbing' : 'cursor-grab hover:border-primary/30'}`} // @allow-theme-risk: opacidade reduzida necessaria para indicar elemento sendo arrastado (isDragging) no drag and drop
      onClick={() => {
        if (isDragging) return;
        onClick(order.id);
      }}
      {...attributes}
      {...listeners}
    >
      <div className={compact ? 'p-2.5 md:p-3' : 'p-3.5 md:p-4 xl:p-5'}>
        {/* 1. Header (Código e Timer/SLA) */}
        <div className="flex items-center justify-between mb-2 md:mb-3 xl:mb-4">
          <span className={`font-black text-foreground ${compact ? 'text-xs md:text-sm' : 'text-base'} bg-muted px-2.5 py-1 rounded-lg border border-border`}>
            #{order.orderNumber}
          </span>
          <TimerBadge minutes={elapsedMin} compact={compact} />
        </div>

        {/* 2. Cliente e Canal/Fulfillment */}
        <div className="min-w-0 mb-2.5 md:mb-3 xl:mb-4 space-y-1 md:space-y-1.5 xl:space-y-2">
          <h3
            className={`font-black text-foreground leading-snug flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}
          >
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate">{order.customerName}</span>
          </h3>
          <p className="text-muted-foreground flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>
              {order.fulfillmentType === 'delivery' ? '📦 Entrega' : order.isScheduled ? '📅 Agendado' : '🏪 Retirada'}
            </span>
            <span>·</span>
            <span>
              {SOURCE_CHANNEL_LABELS[order.sourceChannel as keyof typeof SOURCE_CHANNEL_LABELS] || order.sourceChannel || 'Online'}
            </span>
          </p>
        </div>

        {/* 3. Agendamento se houver */}
        {order.isScheduled && order.scheduledFor && (
          <div className="mb-2.5 md:mb-3 xl:mb-4 px-2 py-1.5 md:px-3 md:py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2">
            <Clock className="w-4 h-4" />
            <span>AGENDADO: {new Date(order.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}

        {/* 4. Resumo de Itens e Status + Valor */}
        <div className="space-y-2 md:space-y-2.5 xl:space-y-3 pt-2 md:pt-2.5 xl:pt-3 border-t border-border/40">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={order.status as OrderStatus} />
            <span className={`font-black text-foreground flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{totalLabel}</span>
            </span>
          </div>

          {/* Entregador */}
          {order.fulfillmentType === 'delivery' && (
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
              <div className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${order.deliveryDriverName ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-muted text-muted-foreground'}`}>
                <User className="w-3.5 h-3.5" />
              </div>
              <span className={order.deliveryDriverName ? 'text-indigo-600 dark:text-indigo-400 truncate max-w-[150px]' : 'text-muted-foreground italic'}>
                {order.deliveryDriverName || 'Sem entregador'}
              </span>
              {order.deliveryDriverStatus === 'busy' && (
                <span className="ml-auto w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" title="Entregador em rota" />
              )}
            </div>
          )}

          {/* Resumo de itens */}
          <div className="rounded-xl px-2 py-1.5 md:px-3 md:py-2 bg-muted/40 border border-border/45 flex items-start gap-2">
            <ShoppingBag className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[10px] md:text-[11px] text-foreground font-medium leading-relaxed">
              <strong className="text-primary mr-1">{order.itemCount} {order.itemCount === 1 ? 'item' : 'itens'}:</strong>
              <span className="text-muted-foreground italic">{order.itemsSummary}</span>
            </p>
          </div>

          {/* Observações gerais */}
          {!compact && order.notes && (
            <div className="rounded-xl px-2 py-1.5 md:px-3 md:py-2 bg-amber-500/5 border border-amber-500/15 flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] md:text-[11px] text-amber-600 dark:text-amber-400 font-semibold leading-relaxed">
                Obs: {order.notes}
              </p>
            </div>
          )}
        </div>

        {/* 5. Toolbar de Ações Rápidas */}
        <div className="mt-2 md:mt-2.5 xl:mt-3 pt-2 md:pt-2.5 border-t border-border/40 flex items-center gap-2">
          {nextStatus ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdvance(order.id, nextStatus);
              }}
              disabled={updating}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 md:h-9 rounded-xl font-black uppercase tracking-wider text-[9px] md:text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.97] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
            >
              <span>
                {nextStatus === 'confirmed' ? 'Confirmar' :
                  nextStatus === 'preparing' ? 'Para Cozinha' :
                    nextStatus === 'ready_for_delivery' ? 'Pronto (Despacho)' :
                      nextStatus === 'ready_for_pickup' ? 'Pronto (Retirada)' :
                        nextStatus === 'out_for_delivery' ? 'Despachar' :
                          `Avançar`}
              </span>
              <ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <div className="flex-1 text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-center">Finalizado</div>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrint?.(order.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border/50 hover:border-border flex items-center justify-center transition-all active:scale-95 shadow-sm"
              title="Imprimir Pedido"
            >
              <Printer className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClick(order.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border/50 hover:border-border flex items-center justify-center transition-all active:scale-95 shadow-sm"
              title="Visualizar Detalhes"
            >
              <Eye className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(order.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border/50 hover:border-border flex items-center justify-center transition-all active:scale-95 shadow-sm"
              title="Editar Pedido"
            >
              <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
