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
      <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3 flex justify-between items-center">
        <span>Itens do Pedido</span>
        <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-bold">
          {items.length} {items.length === 1 ? 'item' : 'itens'}
        </span>
      </h3>
      
      <div className="space-y-1">
        {items.map((item) => (
          <div 
            key={item.id} 
            className="group relative bg-white dark:bg-slate-900/40 p-3 rounded-xl border border-transparent hover:border-slate-100 dark:hover:border-slate-800 transition-all"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-primary-600 dark:text-primary-400 shrink-0">
                    {item.quantity}x
                  </span>
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {item.snapshotName}
                  </p>
                </div>

                {/* Composição / Detalhes do Produto */}
                {item.snapshotComposition && (
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 italic">
                    {item.snapshotComposition}
                  </p>
                )}

                {/* Complementos */}
                {item.complements && item.complements.length > 0 && (
                  <div className="mt-1.5 space-y-0.5 pl-5">
                    {item.complements.map((c) => (
                      <div key={c.id} className="flex justify-between items-center text-[11px] text-slate-500">
                        <span>+ {c.snapshotName}</span>
                        {c.snapshotPrice > 0 && (
                          <span className="text-slate-400 font-medium">{fmt(c.snapshotPrice)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Seleções de Combo */}
                {item.comboSelections && item.comboSelections.length > 0 && (
                  <div className="mt-1.5 space-y-0.5 pl-5">
                    {item.comboSelections.map((s) => (
                      <div key={s.id} className="flex justify-between items-center text-[11px] text-slate-500">
                        <span className="truncate">
                          <span className="text-slate-400 mr-1">{s.snapshotBlockName}:</span>
                          {s.snapshotProductName}
                        </span>
                        {s.snapshotAdditionalPrice > 0 && (
                          <span className="text-slate-400 font-medium">{fmt(s.snapshotAdditionalPrice)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Observações do Item */}
                {item.notes && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">
                    <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" /> 
                    <span className="font-medium italic">{item.notes}</span>
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {fmt(item.lineTotal)}
                </p>
                {item.quantity > 1 && (
                  <p className="text-[10px] text-slate-400 font-medium">
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
