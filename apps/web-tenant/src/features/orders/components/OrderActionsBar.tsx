import { memo } from 'react';
import {
  Ban, Printer, Edit2, CheckCircle2, ChefHat, Truck, PackageCheck,
  RefreshCw, UserPlus, type LucideIcon,
} from 'lucide-react';
import type { OrderOperationalAction, OrderOperationalActionType, OrderOperationalViewModel } from '@gestor/types';

interface OrderActionsBarProps {
  operational: OrderOperationalViewModel;
  onAction: (action: OrderOperationalAction) => void;
  onRefresh: () => void;
  isUpdating: boolean;
  isValidating: boolean;
}

const ACTION_ICONS: Record<OrderOperationalActionType, LucideIcon> = {
  CONFIRM: CheckCircle2,
  START_PREPARATION: ChefHat,
  MARK_READY: PackageCheck,
  CANCEL: Ban,
  ASSIGN_DRIVER: UserPlus,
  DISPATCH: Truck,
  RECALCULATE_ROUTE: RefreshCw,
  COMPLETE: CheckCircle2,
  PRINT: Printer,
  EDIT: Edit2,
  OPEN_DETAILS: CheckCircle2,
};

export const OrderActionsBar = memo(function OrderActionsBar({
  operational, onAction, onRefresh, isUpdating, isValidating,
}: OrderActionsBarProps) {
  const primary = operational.primaryAction;
  const secondary = operational.secondaryActions.filter((candidate) => candidate.type !== 'OPEN_DETAILS');
  const PrimaryIcon = primary ? ACTION_ICONS[primary.type] : null;

  return (
    <footer className="p-4 border-t border-border bg-card flex flex-col gap-3 shrink-0">
      {operational.marketplaceOperation.state !== 'NONE' && (
        <p className={`rounded-xl border px-3 py-2 text-center text-xs font-bold ${operational.marketplaceOperation.state === 'FAILED' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-primary/30 bg-primary/10 text-primary'}`}>
          {operational.marketplaceOperation.friendlyMessage}
        </p>
      )}

      {primary && PrimaryIcon && (
        <button
          type="button"
          onClick={() => onAction(primary)}
          disabled={isUpdating}
          className="w-full py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-70"
        >
          {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PrimaryIcon className="w-4 h-4" />}
          {primary.label}
        </button>
      )}

      <div className="grid grid-cols-3 gap-2">
        {secondary.map((candidate) => {
          const Icon = ACTION_ICONS[candidate.type];
          return (
            <button
              key={candidate.type}
              type="button"
              onClick={() => onAction(candidate)}
              disabled={isUpdating}
              className={`py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 border transition-colors ${candidate.type === 'CANCEL' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-muted text-foreground border-border hover:bg-muted/80'}`}
            >
              <Icon className="w-4 h-4" />{candidate.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isValidating}
          className="py-2.5 bg-muted text-foreground rounded-xl font-bold text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1.5 border border-border"
        >
          <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />Atualizar
        </button>
      </div>
    </footer>
  );
});
