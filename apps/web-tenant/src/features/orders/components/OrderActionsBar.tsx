import { memo } from 'react';
import {
  CheckCircle2, ChefHat, Truck, PackageCheck, RefreshCw, UserPlus, Printer, Edit2, Ban,
  type LucideIcon,
} from 'lucide-react';
import type { OrderOperationalAction, OrderOperationalActionType, OrderOperationalViewModel } from '@gestor/types';
import { OrderActionMenu } from './OrderActionMenu';

interface OrderActionsBarProps {
  operational: OrderOperationalViewModel;
  onAction: (action: OrderOperationalAction) => void;
  onRefresh: () => void;
  isUpdating: boolean;
  isValidating: boolean;
  showPrimary?: boolean;
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
  operational, onAction, onRefresh, isUpdating, isValidating, showPrimary = true,
}: OrderActionsBarProps) {
  const primary = operational.primaryAction;
  const secondary = operational.secondaryActions.filter((candidate) => candidate.type !== 'OPEN_DETAILS');
  const PrimaryIcon = primary ? ACTION_ICONS[primary.type] : null;

  return (
    <footer className="flex shrink-0 flex-col gap-2 border-t border-border bg-card p-3 sm:gap-3 sm:p-4">
      {showPrimary && primary && PrimaryIcon && (
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

      <div className="flex items-center justify-between gap-2">
        {secondary.length > 0 ? <OrderActionMenu actions={secondary} onAction={onAction} /> : <span />}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isValidating}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-muted px-3 text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RefreshCw className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />Atualizar
        </button>
      </div>
    </footer>
  );
});
