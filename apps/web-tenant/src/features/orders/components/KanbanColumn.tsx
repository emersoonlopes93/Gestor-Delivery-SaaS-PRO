import { memo } from 'react';
import { Package, type LucideIcon } from 'lucide-react';
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
  onPrint: (orderId: string) => void;
  onEdit: (orderId: string) => void;
  getNextAction: (status: OrderStatus, fulfillmentType: string) => OrderStatus | null;
  fmt: (v: number) => string;
  getElapsedMin: (createdAt: string) => number;
  viewMode: BoardViewMode;
}

export const KanbanColumn = memo(function KanbanColumn(props: KanbanColumnProps) {
  const {
    column, orders, compact, updatingId, elapsedMinById,
    onAdvance, onClickCard, onPrint, onEdit, getNextAction, fmt, getElapsedMin, viewMode,
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
    <section className={`flex flex-col h-full rounded-2xl bg-card border border-border overflow-hidden transition-all ${isOver ? 'ring-2 ring-primary/45 shadow-lg' : 'shadow-sm'}`}>
      <header className="flex items-center justify-between shrink-0 px-5 py-4 border-b border-border bg-muted/30">
        <div className="min-w-0 flex items-center gap-3">
          <Icon className={`shrink-0 text-primary ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
          <div className="min-w-0">
            <h2 className={`font-black text-foreground uppercase tracking-wider ${compact ? 'text-xs' : 'text-sm'}`}>
              {column.title}
            </h2>
            {!compact && (
              <p className="text-[10px] text-muted-foreground mt-0.5 font-bold uppercase tracking-wider">
                {column.subtitle}
              </p>
            )}
          </div>
        </div>
        <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-muted text-foreground border border-border shadow-sm shrink-0">
          {orders.length}
        </span>
      </header>

      <div ref={setNodeRef} className={`${compact ? 'p-3' : 'p-4'} overflow-y-auto space-y-3 grow min-h-0 ${orders.length > 5 ? 'custom-scrollbar' : 'no-scrollbar'} bg-card/40`}>
        {isEmpty ? (
          viewMode === 'standard' ? (
            <div className="h-28 flex flex-col items-center justify-center border border-dashed border-border rounded-2xl bg-muted/20 gap-2 p-4 text-center">
              <Package className="w-6 h-6 text-muted-foreground opacity-50" />
              <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
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
                  onPrint={onPrint}
                  onEdit={onEdit}
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
