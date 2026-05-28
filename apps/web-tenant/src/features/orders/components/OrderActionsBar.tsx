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
  pending: { label: 'Confirmar Pedido', icon: CheckCircle2, color: 'bg-primary-600 hover:bg-primary-700 shadow-primary-900/10' },
  confirmed: { label: 'Enviar p/ Cozinha', icon: ChefHat, color: 'bg-orange-600 hover:bg-orange-700 shadow-orange-900/10' },
  preparing: { label: 'Marcar como Pronto', icon: PackageCheck, color: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/10' },
  ready_for_delivery: { label: 'Despachar Agora', icon: Truck, color: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-900/10' },
  ready_for_pickup: { label: 'Entregar p/ Cliente', icon: CheckCircle2, color: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/10' },
  out_for_delivery: { label: 'Concluir Entrega', icon: CheckCircle2, color: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/10' },
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
    <footer className="p-4 border-t border-border200 dark:border-border800 bg-card dark:bg-slate-900 flex flex-col gap-3 shrink-0">
      
      {/* Ação Principal (Avançar Status) */}
      {!isFinalStatus && nextAction && (
        <button 
          onClick={onAdvance}
          disabled={isUpdating}
          className={`w-full py-3.5 ${nextAction.color} text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg`}
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
          className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground700 dark:text-muted-foreground300 rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-colors border border-border200 dark:border-border700"
        >
          <Printer className="w-4 h-4" /> 
          Imprimir
        </button>

        {canEdit ? (
          <button 
            onClick={onEdit}
            className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground700 dark:text-muted-foreground300 rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-colors border border-border200 dark:border-border700"
          >
            <Edit2 className="w-4 h-4" /> 
            Editar
          </button>
        ) : (
          <button 
            onClick={onRefresh}
            disabled={isValidating}
            className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-muted-foreground700 dark:text-muted-foreground300 rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-colors border border-border200 dark:border-border700"
          >
            <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} /> 
            Atualizar
          </button>
        )}

        {!isFinalStatus && (
          <button 
            onClick={onCancel}
            disabled={isUpdating}
            className="py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 transition-colors border border-red-100 dark:border-red-900/30"
          >
            <Ban className="w-4 h-4" /> 
            Cancelar
          </button>
        )}
      </div>
    </footer>
  );
});
