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

export default function ManagerOrderCard({ order, now, onOpen, onAction, onPrint, alertSeverity, onOpenAlert, isActionPending, isPrinting }: Props) {
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
    <article className={`group relative rounded-xl border border-border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md`}>
      <button type="button" className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Abrir pedido ${order.orderNumber}`} onClick={() => onOpen(order)} />
      <div className="pointer-events-none relative">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-2"> 
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{providerLabel(order.operational)}</p>
            <h3 className="mt-1 text-lg font-black leading-none text-foreground sm:text-xl">#{order.orderNumber}</h3>
          </div>
          <div className="flex max-w-[12rem] flex-wrap items-center justify-end gap-1.5">
            {alertSeverity && onOpenAlert ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpenAlert(); }} aria-label={`Abrir alerta ${alertSeverity} do pedido ${order.orderNumber}`} data-severity={alertSeverity} className={`pointer-events-auto relative z-10 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${alertSeverity === 'CRITICAL' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}><AlertTriangle className="h-3 w-3" />{alertSeverity}</button> : null}
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${attention ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'border-border bg-muted text-muted-foreground'}`}>{attention ? <AlertTriangle className="h-3 w-3" /> : <Radio className="h-3 w-3" />}{elapsedLabel}</span>
            <span className="max-w-24 truncate text-right text-[9px] font-black uppercase tracking-wide text-foreground">{status.label}</span>
            <button type="button" disabled={isPrinting} title="Imprimir pedido" aria-label={`Imprimir pedido ${order.orderNumber}`} onClick={(event) => { event.stopPropagation(); onPrint(order); }} className="pointer-events-auto relative z-10 grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60"><Printer className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="space-y-2 py-3">
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{order.itemCount} itens · {order.itemsSummary}</p>
          <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Indicadores operacionais">
            {syncLabel ? <span className={`inline-flex w-full items-center gap-1 border px-2 py-1 text-[11px] font-bold leading-relaxed ${order.operational.syncState === 'FAILED' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
              <Radio className="h-3 w-3" />{syncLabel}
            </span> : null}
          </div>
        </div>
        <div className="flex items-center justify-end border-t border-border pt-3">
          {isRunnableStatusAction(action) ? <button type="button" disabled={isActionPending} onClick={(event) => { event.stopPropagation(); onAction(order, action); }} className="pointer-events-auto relative z-10 inline-flex items-center gap-1 border border-primary bg-primary px-3 py-2 text-[11px] font-black uppercase tracking-wide text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60">{isActionPending ? 'Atualizando…' : action.label}<ChevronRight className="h-4 w-4" /></button> : <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-primary">{action?.label ?? 'Detalhes'}<ChevronRight className="h-4 w-4" /></span>}
        </div>
      </div>
    </article>
  );
}
