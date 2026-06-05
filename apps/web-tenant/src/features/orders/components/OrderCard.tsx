import { memo } from 'react';
import { Clock, ArrowRight, User } from 'lucide-react';
import type { OrderBoardItemDTO, OrderStatus } from '@gestor/types';
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

const CHANNEL_LABELS: Record<string, string> = {
  storefront: 'Online',
  pos: 'PDV',
  whatsapp_ai: 'IA',
  whatsapp: 'WhatsApp',
  ifood: 'iFood',
};

type StatusTone = {
  cls: string;
  dot?: string;
};

const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  pending:            { cls: 'status-badge-pending',  dot: 'bg-amber-400' },
  confirmed:          { cls: 'status-badge-confirmed', dot: 'bg-blue-400' },
  preparing:          { cls: 'status-badge-preparing', dot: 'bg-orange-400' },
  ready_for_pickup:   { cls: 'status-badge-success',  dot: 'bg-emerald-400' },
  ready_for_delivery: { cls: 'status-badge-success',  dot: 'bg-emerald-400' },
  out_for_delivery:   { cls: 'status-badge-indigo',   dot: 'bg-violet-400' },
  completed:          { cls: 'status-badge-neutral',  dot: 'bg-slate-400' },
  cancelled:          { cls: 'status-badge-danger',   dot: 'bg-red-400' },
  draft:              { cls: 'status-badge-neutral',  dot: 'bg-slate-300' },
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
  const urgent = minutes > 30;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black ring-1 ${
        urgent
          ? 'bg-destructive/10 text-destructive ring-destructive/20'
          : 'bg-muted text-muted-foreground ring-border'
      }`}
    >
      <Clock className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {minutes}m
    </span>
  );
});

export interface OrderCardProps {
  order: OrderBoardItemDTO;
  compact: boolean;
  updating: boolean;
  onAdvance: (orderId: string, nextStatus: OrderStatus) => void;
  onClick: (orderId: string) => void;
  nextStatus: OrderStatus | null;
  elapsedMin: number;
  totalLabel: string;
}

export const OrderCard = memo(function OrderCard(props: OrderCardProps) {
  const { order, compact, updating, onAdvance, onClick, nextStatus, elapsedMin, totalLabel } = props;

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
      className={`relative border border-border bg-background rounded-[20px] transition-all duration-200 hover:shadow-md hover:scale-[1.005] ${isDragging ? 'opacity-40 z-50 ring-2 ring-primary scale-105 cursor-grabbing' : 'cursor-grab hover:border-primary/30'}`} // @allow-theme-risk: opacidade reduzida necessaria para indicar elemento sendo arrastado (isDragging) no drag and drop
      onClick={() => {
        // Ignorar click se estiver arrastando
        if (isDragging) return;
        onClick(order.id);
      }}
      {...attributes}
      {...listeners}
    >
      <div className={compact ? 'p-3' : 'p-4'}>
        {/* 1. Header (Código e Timer) */}
        <div className="flex items-center justify-between mb-3">
          <span className={`font-black text-foreground ${compact ? 'text-[12px] md:text-[13px]' : 'text-sm'}`}>
            #{order.orderNumber}
          </span>
          <TimerBadge minutes={elapsedMin} compact={compact} />
        </div>

        {/* 2. Cliente e Canal */}
        <div className="min-w-0 mb-3">
          <h3
            className={`font-black text-foreground leading-snug line-clamp-1 ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            {order.customerName}
          </h3>
          <p className={`text-muted-foreground mt-1 line-clamp-1 font-bold text-[10px]`}>
            {order.fulfillmentType === 'delivery' ? '📦 Entrega' : order.isScheduled ? '📅 Agendado' : '🏪 Retirada'}
            {' · '}
            {CHANNEL_LABELS[order.sourceChannel || ''] || order.sourceChannel || 'Online'}
          </p>
        </div>

        {/* 3. Status e Valor */}
        {order.isScheduled && order.scheduledFor && (
          <div className="mb-3 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>AGENDADO: {new Date(order.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-2.5 pb-2.5 border-t border-b border-border/40">
          <StatusBadge status={order.status as OrderStatus} />
          <span className={`font-black text-foreground ${compact ? 'text-xs' : 'text-sm'}`}>
            {totalLabel}
          </span>
        </div>

        {/* 4. Entregador e Itens */}
        {order.fulfillmentType === 'delivery' && (
          <div className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
            <div className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${order.deliveryDriverName ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-muted text-muted-foreground'}`}>
              <User className="w-3.5 h-3.5" />
            </div>
            <span className={order.deliveryDriverName ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground italic'}>
              {order.deliveryDriverName || 'Sem entregador'}
            </span>
            {order.deliveryDriverStatus === 'busy' && (
              <span className="ml-auto w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" title="Entregador em rota" />
            )}
          </div>
        )}

        {!compact && (
          <div
            className="mt-3 rounded-xl px-3 py-2 bg-muted/30 border border-border/50"
          >
            <p className="text-[10px] md:text-[11px] text-muted-foreground italic line-clamp-2 leading-relaxed">
              {order.itemsSummary || `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'itens'}`}
            </p>
          </div>
        )}
      </div>

      {nextStatus && (
        <div
          className="px-3 pb-3 pt-1 border-t border-border/40"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // Evita abrir o drawer
              onAdvance(order.id, nextStatus);
            }}
            disabled={updating}
            onPointerDown={(e) => e.stopPropagation()} // Previne drag ao clicar no botão
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl font-black uppercase tracking-widest text-[9px] bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.97] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
          >
            <ArrowRight className="w-3.5 h-3.5 md:w-3 md:h-3" />
            <span>
              {nextStatus === 'confirmed' ? 'Confirmar Pedido' :
               nextStatus === 'preparing' ? 'Enviar para Cozinha' :
               nextStatus === 'ready_for_delivery' ? 'Pronto (Aguardar Despacho)' :
               nextStatus === 'ready_for_pickup' ? 'Pronto p/ Retirada' :
               nextStatus === 'out_for_delivery' ? 'Despachar Agora' :
               `Avançar — ${STATUS_LABELS[nextStatus]}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
});
