import { memo } from 'react';
import { 
  Ban, 
  Printer, 
  Edit2, 
  CheckCircle2, 
  ChefHat, 
  Truck, 
  PackageCheck,
  RefreshCw,
  type LucideIcon
} from 'lucide-react';
import type { OrderStatus } from '@gestor/types';

interface OrderActionsBarProps {
  status: OrderStatus;
  onAdvance: () => void;
  onCancel: () => void;
  onPrint: () => void;
  onEdit: () => void;
  onRefresh: () => void;
  isUpdating: boolean;
  isValidating: boolean;
}

const NEXT_ACTION_CONFIG: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  pending: { label: 'Confirmar Pedido', icon: CheckCircle2, color: 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm' },
  confirmed: { label: 'Enviar p/ Cozinha', icon: ChefHat, color: 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm' },
  preparing: { label: 'Marcar como Pronto', icon: PackageCheck, color: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' },
  ready_for_delivery: { label: 'Despachar Agora', icon: Truck, color: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm' },
  ready_for_pickup: { label: 'Entregar p/ Cliente', icon: CheckCircle2, color: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' },
  out_for_delivery: { label: 'Concluir Entrega', icon: CheckCircle2, color: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' },
};

export const OrderActionsBar = memo(function OrderActionsBar({ 
  status, 
  onAdvance, 
  onCancel, 
  onPrint, 
  onEdit,
  onRefresh,
  isUpdating,
  isValidating
}: OrderActionsBarProps) {
  
  const nextAction = NEXT_ACTION_CONFIG[status];
  const canEdit = ['pending', 'confirmed', 'preparing'].includes(status);
  const isFinalStatus = ['completed', 'cancelled'].includes(status);

  return (
    <footer className="p-4 border-t border-border bg-card flex flex-col gap-3 shrink-0">
      
      {/* Ação Principal (Avançar Status) */}
      {!isFinalStatus && nextAction && (
        <button 
          onClick={onAdvance}
          disabled={isUpdating}
          className={`w-full py-3.5 ${nextAction.color} rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed shadow-md`}
        >
          {isUpdating ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <nextAction.icon className="w-4 h-4" />
          )}
          {nextAction.label}
        </button>
      )}

      {/* Ações Secundárias */}
      <div className="grid grid-cols-3 gap-2">
        <button 
          onClick={onPrint}
          className="py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-colors border border-border"
        >
          <Printer className="w-4 h-4 text-primary" /> 
          Imprimir
        </button>

        {canEdit ? (
          <button 
            onClick={onEdit}
            className="py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-colors border border-border"
          >
            <Edit2 className="w-4 h-4 text-primary" /> 
            Editar
          </button>
        ) : (
          <button 
            onClick={onRefresh}
            disabled={isValidating}
            className="py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-colors border border-border"
          >
            <RefreshCw className={`w-4 h-4 text-primary ${isValidating ? 'animate-spin' : ''}`} /> 
            Atualizar
          </button>
        )}

        {!isFinalStatus && (
          <button 
            onClick={onCancel}
            disabled={isUpdating}
            className="py-2.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-colors border border-destructive/20"
          >
            <Ban className="w-4 h-4" /> 
            Cancelar
          </button>
        )}
      </div>
    </footer>
  );
});
