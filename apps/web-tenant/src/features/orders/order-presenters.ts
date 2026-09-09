import type {
  DeliveryRunDTO,
  OrderBoardItemDTO,
  OrderDeliveryOwnership,
  OrderOperationalViewModel,
  OrderOrigin,
  OrderStatus,
  OrderTimelineEntryDTO,
} from '@gestor/types';

export const ORDER_TIME_THRESHOLDS_MINUTES = {
  warning: 15,
  delayed: 30,
} as const;

export const ORDER_STATUS_PRESENTATION: Record<OrderStatus, { label: string; tone: string }> = {
  pending: { label: 'Novo — precisa confirmar', tone: 'status-badge-pending' },
  confirmed: { label: 'Confirmado — aguardando cozinha', tone: 'status-badge-confirmed' },
  preparing: { label: 'Em produção', tone: 'status-badge-preparing' },
  ready_for_pickup: { label: 'Pronto para retirada', tone: 'status-badge-success' },
  ready_for_delivery: { label: 'Pronto para entrega', tone: 'status-badge-success' },
  out_for_delivery: { label: 'Em rota', tone: 'status-badge-indigo' },
  completed: { label: 'Concluído', tone: 'status-badge-neutral' },
  cancelled: { label: 'Cancelado', tone: 'status-badge-danger' },
  draft: { label: 'Rascunho', tone: 'status-badge-neutral' },
};

export type OrderPriority = 'critical' | 'warning' | 'info' | 'normal';
export type BoardFilter =
  | 'all' | 'PEDEHUB' | 'IFOOD' | 'FOOD_99' | 'action'
  | 'delayed' | 'sync_failed' | 'merchant' | 'provider';

const TERMINAL_ORDER_STATUSES = new Set<OrderStatus>(['completed', 'cancelled']);

export type OrderTimingInput = {
  status?: OrderStatus;
  timeline?: readonly Pick<OrderTimelineEntryDTO, 'status' | 'createdAt'>[];
};

function validTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function terminalTimestamp(timing?: OrderTimingInput): number | null | undefined {
  if (!timing?.status || !TERMINAL_ORDER_STATUSES.has(timing.status)) return undefined;
  const timestamps = (timing.timeline ?? [])
    .filter((entry) => entry.status === timing.status)
    .map((entry) => validTimestamp(entry.createdAt))
    .filter((timestamp): timestamp is number => timestamp !== null);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

export function elapsedMinutes(
  createdAt: string,
  now = Date.now(),
  timing?: OrderTimingInput,
): number | null {
  const start = validTimestamp(createdAt);
  if (start === null) return null;
  const terminal = terminalTimestamp(timing);
  if (terminal === null) return null;
  return Math.max(0, Math.floor(((terminal ?? now) - start) / 60_000));
}

export function presentOrderTime(
  createdAt: string,
  now = Date.now(),
  timing?: OrderTimingInput,
): { minutes: number | null; label: string; delayed: boolean } {
  const minutes = elapsedMinutes(createdAt, now, timing);
  if (minutes === null) {
    return { minutes: null, label: 'tempo final não informado', delayed: false };
  }
  if (minutes > ORDER_TIME_THRESHOLDS_MINUTES.delayed) {
    return { minutes, label: `atrasado ${minutes - ORDER_TIME_THRESHOLDS_MINUTES.delayed} min`, delayed: true };
  }
  if (minutes >= ORDER_TIME_THRESHOLDS_MINUTES.warning) {
    return { minutes, label: `há ${minutes} min · atenção`, delayed: false };
  }
  return { minutes, label: `há ${minutes} min`, delayed: false };
}

export function resolveOrderPriority(
  order: Pick<OrderBoardItemDTO, 'status' | 'createdAt' | 'isScheduled' | 'deliveryDriverName' | 'operational'>,
  now = Date.now(),
  timing?: OrderTimingInput,
): { level: OrderPriority; label: string } {
  if (order.operational.syncState === 'FAILED') return { level: 'critical', label: 'Falha de sincronização' };
  if (order.status === 'pending') return { level: 'critical', label: 'Precisa confirmar' };
  const time = presentOrderTime(order.createdAt, now, timing);
  if (time.delayed) return { level: 'warning', label: 'Pedido atrasado' };
  if (order.status === 'ready_for_delivery' && order.operational.deliveryOwnership === 'MERCHANT' && !order.deliveryDriverName) {
    return { level: 'warning', label: 'Pronto sem motoboy' };
  }
  if (order.operational.syncState === 'PENDING') return { level: 'info', label: 'Sincronizando' };
  if (order.isScheduled) return { level: 'info', label: 'Agendado' };
  if (order.status === 'out_for_delivery') return { level: 'info', label: 'Rota atribuída' };
  return { level: 'normal', label: 'Fluxo normal' };
}

export function providerLabel(operational: OrderOperationalViewModel): string {
  return operational.displayChannel;
}

export function deliveryStatement(operational: OrderOperationalViewModel, fulfillmentType: string): string {
  if (fulfillmentType !== 'delivery') return 'Retirada';
  if (operational.deliveryOwnership === 'MERCHANT' && operational.deliverySummary.driverName) {
    return `Motoboy: ${operational.deliverySummary.driverName}`;
  }
  if (operational.deliveryOwnership === 'PROVIDER') return `Entrega pelo ${operational.displayChannel}`;
  return operational.deliverySummary.label;
}

export function matchesBoardSearch(order: OrderBoardItemDTO, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  if (!normalized) return true;
  return [order.orderNumber, order.customerName, order.customerPhone, order.deliveryDriverName]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase('pt-BR').includes(normalized));
}

export function matchesBoardFilter(order: OrderBoardItemDTO, filter: BoardFilter, now = Date.now()): boolean {
  if (filter === 'all') return true;
  if (filter === 'PEDEHUB' || filter === 'IFOOD' || filter === 'FOOD_99') return order.operational.origin === filter;
  if (filter === 'action') return Boolean(order.operational.primaryAction);
  if (filter === 'delayed') return presentOrderTime(order.createdAt, now).delayed;
  if (filter === 'sync_failed') return order.operational.syncState === 'FAILED';
  if (filter === 'merchant') return order.operational.deliveryOwnership === 'MERCHANT';
  return order.operational.deliveryOwnership === 'PROVIDER';
}

export function originQueryValue(origin: OrderOrigin | ''): string {
  return origin;
}

export function ownershipLabel(ownership: OrderDeliveryOwnership): string {
  if (ownership === 'MERCHANT') return 'Entrega própria';
  if (ownership === 'PROVIDER') return 'Entrega marketplace';
  return 'Responsável não confirmado';
}

export type RoutingSummary = {
  driver: string;
  runState: string;
  stopPosition: string;
  eta: string | null;
  metrics: string | null;
  qualityMessage: string | null;
};

export function buildRoutingSummary(run: DeliveryRunDTO | null | undefined, orderId: string): RoutingSummary | null {
  if (!run) return null;
  const stop = run.stops.find((candidate) => candidate.orderId === orderId);
  if (!stop) return null;
  const distance = stop.routeDistanceMeters == null ? null : `${(stop.routeDistanceMeters / 1000).toFixed(1)} km`;
  const duration = stop.routeDurationSeconds == null ? null : `${Math.round(stop.routeDurationSeconds / 60)} min`;
  return {
    driver: run.driverName,
    runState: run.status.replace(/_/g, ' ').toLocaleLowerCase('pt-BR'),
    stopPosition: `Parada ${stop.sequence} de ${run.stops.length}`,
    eta: stop.estimatedArrivalAt
      ? new Date(stop.estimatedArrivalAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null,
    metrics: [distance, duration].filter(Boolean).join(' · ') || null,
    qualityMessage: run.route?.quality === 'DEGRADED'
      ? 'Rota estimada em linha reta — não é uma previsão rodoviária precisa.'
      : run.route?.quality === 'ROAD' ? 'Estimativa por rota viária.' : null,
  };
}
