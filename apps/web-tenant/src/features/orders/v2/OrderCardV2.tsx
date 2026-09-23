import { AlertTriangle, ChevronRight, Printer, Radio } from 'lucide-react';
import type { OrderBoardItemDTO, OrderOperationalAction } from '@gestor/types';
import { ORDER_STATUS_PRESENTATION, providerLabel } from '../order-presenters';
import { formatElapsed, isRunnableStatusAction } from './order-manager-v2';

type Props = {
  order: OrderBoardItemDTO;
  now: number;
  onOpen: (order: OrderBoardItemDTO) => void;
  onAction: (order: OrderBoardItemDTO, action: OrderOperationalAction) => void;
  onPrint: (order: OrderBoardItemDTO) => void;
  alertSeverity?: 'INFO' | 'ATTENTION' | 'CRITICAL';
  onOpenAlert?: () => void;
  isActionPending: boolean;
  isPrinting: boolean;
};

const STATUS_ACCENT: Partial<Record<OrderBoardItemDTO['status'], string>> = {
  pending: 'before:bg-amber-500',
  confirmed: 'before:bg-amber-500',
  preparing: 'before:bg-amber-500',
  ready_for_pickup: 'before:bg-emerald-500',
  ready_for_delivery: 'before:bg-emerald-500',
  out_for_delivery: 'before:bg-sky-500',
  completed: 'before:bg-slate-400',
  cancelled: 'before:bg-destructive',
};

const alertSeverityLabel = (severity: NonNullable<Props['alertSeverity']>) => {
  if (severity === 'CRITICAL') return 'Ação imediata';
  if (severity === 'ATTENTION') return 'Requer atenção';
  return 'Informação';
};

export function OrderCardV2({ order, now, onOpen, onAction, onPrint, alertSeverity, onOpenAlert, isActionPending, isPrinting }: Props) {
  const action = order.operational.primaryAction;
  const attention = alertSeverity ?? (order.operational.syncState === 'FAILED' ? 'ATTENTION' : null);
  const syncLabel = order.operational.syncState === 'FAILED'
    ? 'Não foi possível atualizar a plataforma. Confira o estado antes de tentar novamente.'
    : order.operational.syncState === 'PENDING'
      ? 'Atualização com a plataforma em andamento'
      : null;
  const status = ORDER_STATUS_PRESENTATION[order.status];
  const isTerminal = order.status === 'completed' || order.status === 'cancelled';
  const elapsedLabel = isTerminal ? formatElapsed(order.createdAt, now) : `Aberto há ${formatElapsed(order.createdAt, now)}`;
  return (
    <article className={`group relative rounded-xl border border-border bg-card p-2.5 pl-3.5 shadow-sm transition before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-l-xl hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:p-3 sm:pl-4 ${STATUS_ACCENT[order.status] ?? 'before:bg-border'}`}>
      <button type="button" className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Abrir pedido ${order.orderNumber}`} onClick={() => onOpen(order)} />
      <div className="pointer-events-none relative">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-2.5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{providerLabel(order.operational)}</p>
            <h3 className="mt-1 text-lg font-black leading-none text-foreground sm:text-xl">#{order.orderNumber}</h3>
          </div>
          <div className="flex max-w-[11rem] flex-wrap items-center justify-end gap-1.5">
            {alertSeverity && onOpenAlert ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpenAlert(); }} aria-label={`Abrir alerta ${alertSeverityLabel(alertSeverity)} do pedido ${order.orderNumber}`} data-severity={alertSeverity} className={`pointer-events-auto relative z-10 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${alertSeverity === 'CRITICAL' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}><AlertTriangle className="h-3 w-3" />{alertSeverityLabel(alertSeverity)}<span className="sr-only">Severidade técnica: {alertSeverity}</span></button> : null}
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${attention ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'border-border bg-muted text-muted-foreground'}`}>{attention ? <AlertTriangle className="h-3 w-3" /> : <Radio className="h-3 w-3" />}{elapsedLabel}</span>
            <span className="max-w-24 truncate text-right text-[9px] font-black uppercase tracking-wide text-foreground">{status.label}</span>
            <button type="button" disabled={isPrinting} title="Imprimir pedido" aria-label={`Imprimir pedido ${order.orderNumber}`} onClick={(event) => { event.stopPropagation(); onPrint(order); }} className="pointer-events-auto relative z-10 grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60"><Printer className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="space-y-1.5 py-2.5 sm:space-y-2 sm:py-3">
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{order.itemCount} itens · {order.itemsSummary}</p>
          <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Indicadores operacionais">
            {syncLabel ? <span className={`inline-flex w-full items-center gap-1 border px-2 py-1 text-[9px] font-bold leading-relaxed ${order.operational.syncState === 'FAILED' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
              <Radio className="h-3 w-3" />{syncLabel}
            </span> : null}
          </div>
        </div>
        <div className="flex items-center justify-end border-t border-border pt-3">
          {isRunnableStatusAction(action) ? <button type="button" disabled={isActionPending} onClick={(event) => { event.stopPropagation(); onAction(order, action); }} className="pointer-events-auto relative z-10 inline-flex items-center gap-1 border border-primary bg-primary px-2 py-1.5 text-[11px] font-black uppercase tracking-wide text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">{isActionPending ? 'Atualizando…' : action.label}<ChevronRight className="h-3.5 w-3.5" /></button> : <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-primary">{action?.label ?? 'Detalhes'}<ChevronRight className="h-3.5 w-3.5" /></span>}
        </div>
        {order.operational.marketplaceOperation.state !== 'NONE' ? <p className="mt-3 border-l-2 border-primary pl-2 text-[11px] font-semibold text-muted-foreground">{order.operational.marketplaceOperation.friendlyMessage}</p> : null}
      </div>
    </article>
  );
}
