import { memo } from 'react';
import { MessageSquare } from 'lucide-react';
import type { OrderResponseDTO } from '@gestor/types';

interface OrderItemsSectionProps {
  items: OrderResponseDTO['items'];
}

export const OrderItemsSection = memo(function OrderItemsSection({ items }: OrderItemsSectionProps) {
  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <section>
      <h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-3 flex justify-between items-center">
        <span>Itens do Pedido</span>
        <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full text-[10px] font-bold">
          {items.length} {items.length === 1 ? 'item' : 'itens'}
        </span>
      </h3>
      
      <div className="space-y-2">
        {items.map((item) => (
          <div 
            key={item.id} 
            className="group relative bg-background p-4 rounded-2xl border border-border hover:bg-muted/10 transition-all"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-primary shrink-0">
                    {item.quantity}x
                  </span>
                  <p className="text-sm font-black text-foreground truncate">
                    {item.snapshotName}
                  </p>
                </div>

                {/* Composição / Detalhes do Produto */}
                {item.snapshotComposition && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 italic">
                    {item.snapshotComposition}
                  </p>
                )}



                {/* Observações do Item */}
                {item.notes && (
                  <p className="text-[11px] text-amber-650 mt-2 flex items-start gap-1.5 bg-amber-500/10 px-2 py-1.5 rounded-lg border border-amber-550/20">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" /> 
                    <span className="font-semibold italic text-amber-700 dark:text-amber-400">{item.notes}</span>
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-foreground">
                  {fmt(item.lineTotal)}
                </p>
                {item.quantity > 1 && (
                  <p className="text-[10px] text-muted-foreground font-medium">
                    {fmt(item.lineTotal / item.quantity)} un.
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});
