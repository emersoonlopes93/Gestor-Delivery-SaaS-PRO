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
          ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-800/50'
          : 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
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
      className={`kanban-card ${isDragging ? 'opacity-50 z-50 ring-2 ring-primary-500 scale-105 cursor-grabbing' : 'cursor-grab hover:ring-1 hover:ring-primary-500/50'} relative transition-shadow animate-slide-in-up`}
      onClick={() => {
        // Ignorar click se estiver arrastando
        if (isDragging) return;
        onClick(order.id);
      }}
      {...attributes}
      {...listeners}
    >
      <div className={compact ? 'p-2.5 md:p-3' : 'p-3 md:p-3.5'}>
        <div className="flex items-center justify-between mb-2">
          <span className={`font-black text-slate-900 dark:text-slate-100 ${compact ? 'text-[12px] md:text-[13px]' : 'text-sm'}`}>
            #{order.orderNumber}
          </span>
          <TimerBadge minutes={elapsedMin} compact={compact} />
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3
              className={`font-bold text-slate-900 dark:text-slate-100 leading-tight line-clamp-1 ${
                compact ? 'text-[11px]' : 'text-xs md:text-sm'
              }`}
            >
              {order.customerName}
            </h3>
            <p className={`text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 ${compact ? 'text-[9px]' : 'text-[10px] md:text-[11px]'}`}>
              {order.fulfillmentType === 'delivery' ? 'Entrega' : 'Retirada'}
              {' · '}
              {CHANNEL_LABELS[order.sourceChannel || ''] || order.sourceChannel || 'Online'}
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <StatusBadge status={order.status as OrderStatus} />
            <span className={`font-black text-slate-900 dark:text-slate-100 ${compact ? 'text-[10px] md:text-[11px]' : 'text-xs md:text-sm'}`}>
              {totalLabel}
            </span>
          </div>
        </div>

        {order.fulfillmentType === 'delivery' && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] md:text-[11px] font-bold">
            <div className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center ${order.deliveryDriverName ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
              <User className="w-3 h-3" />
            </div>
            <span className={order.deliveryDriverName ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 italic'}>
              {order.deliveryDriverName || 'Sem entregador atribuído'}
            </span>
            {order.deliveryDriverStatus === 'busy' && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" title="Entregador em rota" />
            )}
          </div>
        )}

        {!compact && (
          <div
            className="mt-2.5 rounded-lg px-2.5 py-1.5 md:px-3 md:py-2"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="text-[10px] md:text-[11px] text-slate-600 dark:text-slate-400 italic line-clamp-2">
              {order.itemsSummary || `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'itens'}`}
            </p>
          </div>
        )}
      </div>

      {nextStatus && (
        <div
          className="px-2.5 pb-2.5 md:px-3 md:pb-3"
          style={{ borderTop: compact ? undefined : '1px solid var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // Evita abrir o drawer
              onAdvance(order.id, nextStatus);
            }}
            disabled={updating}
            onPointerDown={(e) => e.stopPropagation()} // Previne drag ao clicar no botão
            className={`w-full flex items-center justify-center gap-2 py-2.5 md:py-2 rounded-xl md:rounded-lg font-black uppercase tracking-wider transition-all duration-200 active:scale-[0.97] ${
              compact ? 'btn-advance-compact' : 'btn-advance-primary'
            }`}
          >
            <ArrowRight className="w-3.5 h-3.5 md:w-3 md:h-3" />
            <span className="text-[11px] md:text-[10px]">
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
