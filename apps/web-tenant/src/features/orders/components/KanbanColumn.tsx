import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { OrderBoardItemDTO, OrderStatus } from '@gestor/types';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { OrderCard } from './OrderCard';

export type BoardViewMode = 'compact' | 'standard' | 'focus_production';

export type KanbanColumnSpec = {
  id: 'entry' | 'production' | 'delivery';
  title: string;
  subtitle: string;
  statuses: OrderStatus[];
  icon: LucideIcon;
  accentCol: string;
  headerCol: string;
  countCls: string;
  colCls: string;
  headerBorder: string;
};

interface KanbanColumnProps {
  column: KanbanColumnSpec;
  orders: OrderBoardItemDTO[];
  compact: boolean;
  updatingId: string | null;
  elapsedMinById: Map<string, number>;
  onAdvance: (orderId: string, nextStatus: OrderStatus) => void;
  onClickCard: (orderId: string) => void;
  getNextAction: (status: OrderStatus, fulfillmentType: string) => OrderStatus | null;
  fmt: (v: number) => string;
  getElapsedMin: (createdAt: string) => number;
  viewMode: BoardViewMode;
}

export const KanbanColumn = memo(function KanbanColumn(props: KanbanColumnProps) {
  const {
    column, orders, compact, updatingId, elapsedMinById,
    onAdvance, onClickCard, getNextAction, fmt, getElapsedMin, viewMode,
  } = props;

  const Icon = column.icon;
  const isEmpty = orders.length === 0;

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: 'Column',
      column,
    },
  });

  return (
    <section className={`kanban-col ${column.colCls} ${column.accentCol} ${isOver ? 'ring-2 ring-primary-500/50' : ''}`}>
      <header className={`flex items-start justify-between shrink-0 px-4 py-3 border-b ${column.headerBorder}`}>
        <div className="min-w-0 flex items-center gap-2.5">
          <Icon className={`shrink-0 opacity-60 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-muted-foreground`} />
          <div className="min-w-0">
            <h2 className={`font-black text-foreground uppercase tracking-wide ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
              {column.title}
            </h2>
            {!compact && (
              <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                {column.subtitle}
              </p>
            )}
          </div>
        </div>
        <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${column.countCls} ml-2 shrink-0`}>
          {orders.length}
        </span>
      </header>

      <div ref={setNodeRef} className={`${compact ? 'p-2' : 'p-3'} overflow-y-auto space-y-2.5 grow min-h-0 custom-scrollbar`}>
        {isEmpty ? (
          viewMode === 'standard' ? (
            <div className="h-16 flex items-center justify-center border-2 border-dashed border-border rounded-xl">
              <span className="text-[11px] font-bold text-muted-foreground">
                Solte pedidos aqui
              </span>
            </div>
          ) : null
        ) : (
          <SortableContext items={orders.map(o => o.id)} strategy={verticalListSortingStrategy}>
            {orders.map((order) => {
              const nextActionStatus = getNextAction(order.status as OrderStatus, order.fulfillmentType);
              const elapsed = elapsedMinById.get(order.id) ?? getElapsedMin(order.createdAt);
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  compact={compact}
                  updating={updatingId === order.id}
                  onAdvance={onAdvance}
                  onClick={onClickCard}
                  nextStatus={nextActionStatus as OrderStatus | null}
                  elapsedMin={elapsed}
                  totalLabel={fmt(order.total)}
                />
              );
            })}
          </SortableContext>
        )}
      </div>
    </section>
  );
});
