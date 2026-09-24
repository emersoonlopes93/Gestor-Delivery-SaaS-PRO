import {
  AlertTriangle,
  CircleDollarSign,
  Printer,
  Radio,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react';
import type { OrderBoardItemDTO, OrderOperationalAction } from '@gestor/types';
import {
  presentOrderTime,
  providerLabel,
} from '../order-presenters';
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

const severityLabel = (severity: NonNullable<Props['alertSeverity']>) => {
  if (severity === 'CRITICAL') return 'Ação imediata';
  if (severity === 'ATTENTION') return 'Requer atenção';
  return 'Informação';
};

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value);

export default function ManagerOrderCard({
  order,
  now,
  onOpen,
  onAction,
  onPrint,
  alertSeverity,
  onOpenAlert,
  isActionPending,
  isPrinting,
}: Props) {
  const action = order.operational.primaryAction;
  const syncState = order.operational.syncState;
  const isTerminal = order.status === 'completed' || order.status === 'cancelled';
  const timing = presentOrderTime(order.createdAt, now);
  const elapsedLabel = isTerminal
    ? `Duração ${formatElapsed(order.createdAt, now)}`
    : timing.label;
  const financial = order.operational.financialSummary;
  const delivery = order.operational.deliverySummary;
  const hasAttention = alertSeverity || syncState === 'FAILED' || timing.delayed;

  return (
    <article className={`group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md before:absolute before:inset-y-0 before:left-0 before:w-1 ${STATUS_ACCENT[order.status] ?? 'before:bg-border'}`}>
      <button
        type="button"
        className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        aria-label={`Abrir pedido ${order.orderNumber}`}
        onClick={() => onOpen(order)}
      />
      <div className="pointer-events-none relative flex flex-col justify-between p-3 pl-4">
        {/* TOPO: Provedor/Canal + Número do Pedido (Esq) | Tempo Decorrido (Dir) */}
        <header className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
          <div className="min-w-0 flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 shrink-0">
              {order.operational.provider === 'PEDEHUB' && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-sky-500">PedeHub</span>}
              {order.operational.provider === 'IFOOD' && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-black italic tracking-wide text-red-500">iFood</span>}
              {order.operational.provider === 'FOOD_99' && <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-black italic tracking-wide text-yellow-500">99Food</span>}
              {order.operational.provider !== 'PEDEHUB' && order.operational.provider !== 'IFOOD' && order.operational.provider !== 'FOOD_99' && (
                <p className="truncate font-mono text-[11px] font-black uppercase tracking-[0.14em] text-primary">
                  {providerLabel(order.operational)}
                </p>
              )}
            </div>
            <h3 className="truncate text-base font-black leading-none text-foreground">
              {order.orderNumber.startsWith("#") ? order.orderNumber : "#" + order.orderNumber}
            </h3>
          </div>
          <div className="shrink-0">
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-black tabular-nums ${hasAttention ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'border-border bg-muted text-muted-foreground'}`}>
              {hasAttention ? <AlertTriangle className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
              {elapsedLabel}
            </span>
          </div>
        </header>

        {/* FAIXA DEDICADA DE ALERTAS */}
        {(alertSeverity && onOpenAlert) ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5" aria-label="Alertas do pedido">
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); onOpenAlert(); }}
              aria-label={`Abrir alerta ${severityLabel(alertSeverity)} do pedido ${order.orderNumber}`}
              data-severity={alertSeverity}
              className={`pointer-events-auto relative z-10 inline-flex max-w-full items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-black uppercase tracking-wide truncate ${alertSeverity === 'CRITICAL' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="truncate">{severityLabel(alertSeverity)}</span>
            </button>
          </div>
        ) : null}

        {/* CLIENTE E ITENS */}
        <div className="mt-2.5 space-y-1.5 text-xs text-muted-foreground">
          <p className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{order.customerName}</span>
          </p>
          <p className="flex min-w-0 items-start gap-1.5 leading-relaxed">
            <UtensilsCrossed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="line-clamp-2">{order.itemCount} itens · {order.itemsSummary}</span>
          </p>
        </div>

        {/* INDICADORES OPERACIONAIS / LOGÍSTICA / SINCRONIZAÇÃO */}
        <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Indicadores operacionais">
          <span className="inline-flex max-w-full items-center truncate rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground" title={delivery.label}>
            {delivery.label}
          </span>
          {syncState === 'PENDING' ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
              <Radio className="h-3 w-3" />Sincronizando
            </span>
          ) : null}
          {syncState === 'FAILED' ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
              <AlertTriangle className="h-3 w-3" />Verificar sincronização
            </span>
          ) : null}
        </div>

        {/* RODAPÉ: VALOR TOTAL + AÇÕES (IMPRIMIR SECUNDÁRIO + AÇÃO PRINCIPAL) */}
        <footer className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <CircleDollarSign className="h-3 w-3" />{financial.operationalValueLabel}
            </p>
            <p className="mt-0.5 text-base font-black tabular-nums text-primary">{formatCurrency(financial.operationalValue)}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={isPrinting}
              title="Imprimir pedido"
              aria-label={`Imprimir pedido ${order.orderNumber}`}
              onClick={(event) => { event.stopPropagation(); onPrint(order); }}
              className="pointer-events-auto relative z-10 grid h-8 w-8 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
            {isRunnableStatusAction(action) ? (
              <button
                type="button"
                disabled={isActionPending}
                onClick={(event) => { event.stopPropagation(); onAction(order, action); }}
                className={`pointer-events-auto relative z-10 inline-flex min-h-8 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-60 ${
                  action.targetStatus === 'preparing' ? 'bg-amber-500 text-amber-950 hover:bg-amber-400 focus-visible:ring-amber-500' :
                  action.targetStatus === 'ready_for_pickup' || action.targetStatus === 'ready_for_delivery' || action.targetStatus === 'out_for_delivery' ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400 focus-visible:ring-emerald-500' :
                  'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary'
                }`}
              >
                {isActionPending ? 'Atualizando…' : action.label}
              </button>
            ) : (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); onOpen(order); }}
                className="pointer-events-auto relative z-10 inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-700 bg-transparent px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
              >
                {action?.label ?? 'Acompanhar'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </article>
  );
}
