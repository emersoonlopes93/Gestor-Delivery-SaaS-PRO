import { memo } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import type { OrderTimelineEntryDTO } from '@gestor/types';

interface OrderTimelineSectionProps {
  timeline: OrderTimelineEntryDTO[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pedido Recebido',
  confirmed: 'Pedido Confirmado',
  preparing: 'Iniciado Preparo',
  ready_for_pickup: 'Pronto p/ Retirada',
  ready_for_delivery: 'Pronto p/ Entrega',
  out_for_delivery: 'Saiu para Entrega',
  completed: 'Pedido Entregue',
  cancelled: 'Pedido Cancelado',
  draft: 'Rascunho',
};

export const OrderTimelineSection = memo(function OrderTimelineSection({ timeline }: OrderTimelineSectionProps) {
  
  // Ordenar timeline por data (mais recente primeiro para o topo, ou antiga primeiro para o fluxo?)
  // Geralmente fluxo é do mais antigo para o mais novo
  const sortedTimeline = [...timeline].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <section>
      <h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-5">Linha do Tempo</h3>
      
      <div className="space-y-0 pl-2">
        {sortedTimeline.map((entry, index) => {
          const isLast = index === sortedTimeline.length - 1;
          const isFirst = index === 0;
          
          return (
            <div key={entry.id} className="flex gap-4 relative">
              {/* Linha conectora */}
              {!isLast && (
                <div className="absolute top-6 left-2.5 w-px h-[calc(100%-12px)] bg-border" />
              )}
              
              {/* Ícone / Ponto */}
              <div className="relative z-10 shrink-0 mt-1">
                {isLast ? (
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center ring-4 ring-background">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center ring-4 ring-background">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                  </div>
                )}
              </div>
              
              {/* Conteúdo */}
              <div className="pb-6">
                <div className="flex items-center gap-2">
                  <p className={`text-xs font-black uppercase tracking-tight ${isLast ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {STATUS_LABELS[entry.status] || entry.status}
                  </p>
                  <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3 text-primary" />
                    {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                {entry.note && (
                  <p className="text-[11px] text-muted-foreground mt-1 italic leading-relaxed">
                    {entry.note}
                  </p>
                )}
                
                {isFirst && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(entry.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
});
