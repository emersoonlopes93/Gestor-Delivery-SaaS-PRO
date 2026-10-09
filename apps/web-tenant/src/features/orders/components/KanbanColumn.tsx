import { memo, useEffect, useRef } from 'react';
import { Package, type LucideIcon } from 'lucide-react';
import type { OrderBoardItemDTO, OrderOperationalAction, OrderStatus } from '@gestor/types';
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
  onAction: (orderId: string, action: OrderOperationalAction) => void;
  onClickCard: (orderId: string) => void;
  fmt: (v: number) => string;
  getElapsedMin: (createdAt: string) => number;
  viewMode: BoardViewMode;
  isActive: boolean;
}

export const KanbanColumn = memo(function KanbanColumn(props: KanbanColumnProps) {
  const {
    column, orders, compact, updatingId, elapsedMinById,
    onAction, onClickCard, fmt, getElapsedMin, viewMode, isActive,
  } = props;

  const Icon = column.icon;
  const isEmpty = orders.length === 0;
  const emptyLabel = column.id === 'entry'
    ? 'Nenhum pedido novo'
    : column.id === 'production'
      ? 'Nenhum pedido em produção'
      : 'Nenhum pedido aguardando entrega';

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: 'Column',
      column,
    },
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isActive) scrollRef.current?.scrollTo({ top: 0 });
  }, [isActive]);

  const setColumnRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    scrollRef.current = node;
  };

  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all ${isOver ? 'ring-2 ring-primary/45 shadow-lg' : 'shadow-sm'}`}>
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-5 py-4 [@media(max-height:650px)]:py-2">
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

      <div ref={setColumnRef} className={`${compact ? 'p-3' : 'p-4'} min-h-0 flex-1 space-y-3 overflow-y-auto custom-scrollbar bg-card/40 [@media(max-height:650px)]:p-2`}>
        {isEmpty ? (
          viewMode === 'standard' ? (
            <div className="h-28 flex flex-col items-center justify-center border border-dashed border-border rounded-2xl bg-muted/20 gap-2 p-4 text-center">
              <Package className="w-6 h-6 text-muted-foreground opacity-50" />
              <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                {emptyLabel}
              </span>
            </div>
          ) : null
        ) : (
          <SortableContext items={orders.map(o => o.id)} strategy={verticalListSortingStrategy}>
            {orders.map((order) => {
              const elapsed = elapsedMinById.get(order.id) ?? getElapsedMin(order.createdAt);
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  compact={compact}
                  updating={updatingId === order.id}
                  onAction={onAction}
                  onClick={onClickCard}
                  elapsedMin={elapsed}
                  formattedValue={fmt(order.operational.financialSummary.operationalValue)}
                />
              );
            })}
          </SortableContext>
        )}
      </div>
    </section>
  );
});
