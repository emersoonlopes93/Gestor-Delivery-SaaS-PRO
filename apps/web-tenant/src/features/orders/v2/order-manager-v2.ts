import type { OrderBoardItemDTO, OrderOperationalAction, OrderStatus } from '@gestor/types';
import { presentOrderTime } from '../order-presenters';

export type OrderManagerLane = 'kitchen' | 'ready' | 'route';

export const ORDER_MANAGER_LANES: readonly { id: OrderManagerLane; label: string; statuses: readonly OrderStatus[]; description: string }[] = [
  { id: 'kitchen', label: 'Cozinha', statuses: ['pending', 'confirmed', 'preparing'], description: 'Entrada e preparo' },
  { id: 'ready', label: 'Prontos', statuses: ['ready_for_pickup', 'ready_for_delivery'], description: 'Retirada ou despacho' },
  { id: 'route', label: 'Em rota', statuses: ['out_for_delivery'], description: 'Acompanhamento logístico' },
] as const;

export function groupOrdersForManager(orders: readonly OrderBoardItemDTO[]): Record<OrderManagerLane, OrderBoardItemDTO[]> {
  const groups: Record<OrderManagerLane, OrderBoardItemDTO[]> = { kitchen: [], ready: [], route: [] };
  for (const order of orders) {
    const lane = ORDER_MANAGER_LANES.find((candidate) => candidate.statuses.includes(order.status));
    if (lane) groups[lane.id].push(order);
  }
  return groups;
}

export function normalizeOrderSearchText(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function buildOrderSearchText(order: OrderBoardItemDTO): string {
  return [order.orderNumber, getProviderOrderNumber(order), order.customerName, order.customerPhone, order.deliveryDriverName, order.itemsSummary, order.searchText, order.notes]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

export function formatOrderDisplayNumber(value: string): string {
  return `#${value.trim().replace(/^#+\s*/, '')}`;
}

/** A platform display number is distinct from the provider's technical order ID. */
export function getProviderOrderNumber(order: Pick<OrderBoardItemDTO, 'id' | 'operational'>): string | null {
  if (order.operational.origin === 'PEDEHUB') return null;
  const value = order.operational.providerOrderNumber?.trim().replace(/^#+\s*/, '');
  if (!value || value === order.id || /^[0-9]{16,}$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return null;
  return value;
}

export function matchesOrderSearch(order: OrderBoardItemDTO, query: string): boolean {
  const normalized = normalizeOrderSearchText(query);
  return !normalized || normalizeOrderSearchText(buildOrderSearchText(order)).includes(normalized);
}

export function filterManagerOrders(orders: readonly OrderBoardItemDTO[], query: string, origin: string): OrderBoardItemDTO[] {
  return orders.filter((order) => {
    const matchesOrigin = origin === 'all' || order.operational.origin === origin;
    if (!matchesOrigin) return false;
    return matchesOrderSearch(order, query);
  });
}

/** Compact, board-wide operational totals. They intentionally ignore local search/origin filters. */
export function getOperationalIntelligence(orders: readonly OrderBoardItemDTO[], now: number) {
  const channels = { PEDEHUB: 0, IFOOD: 0, FOOD_99: 0 };
  let waitingAction = 0;
  let delayed = 0;
  let ready = 0;
  let delivery = 0;
  let pickup = 0;
  for (const order of orders) {
    if (order.operational.origin in channels) channels[order.operational.origin as keyof typeof channels] += 1;
    if (order.status === 'pending' || ((order.status === 'ready_for_pickup' || order.status === 'ready_for_delivery') && order.operational.primaryAction?.enabled)) waitingAction += 1;
    if (presentOrderTime(order.createdAt, now).delayed) delayed += 1;
    if (order.status === 'ready_for_pickup' || order.status === 'ready_for_delivery') ready += 1;
    if (order.fulfillmentType === 'delivery') delivery += 1;
    if (order.fulfillmentType === 'pickup') pickup += 1;
  }
  return { waitingAction, delayed, ready, delivery, pickup, channels };
}

export function formatElapsed(createdAt: string, now: number): string {
  const startedAt = new Date(createdAt).getTime();
  if (!Number.isFinite(startedAt)) return 'tempo indisponível';
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function privacySafeOrderPhrase(order: Pick<OrderBoardItemDTO, 'orderNumber' | 'operational'>): string {
  return order.operational.syncState === 'FAILED'
    ? `Atenção: pedido ${order.orderNumber} precisa de verificação.`
    : `Novo evento operacional no pedido ${order.orderNumber}.`;
}

export function isRunnableStatusAction(action: OrderOperationalAction | null | undefined): action is OrderOperationalAction & { targetStatus: OrderStatus } {
  return Boolean(action?.enabled && action.targetStatus && action.type !== 'ASSIGN_DRIVER' && action.type !== 'DISPATCH');
}

export class OrderAlertQueue {
  private active = false;
  private queue: string[] = [];

  enqueue(message: string, speak: (phrase: string) => Promise<void> | void): void {
    this.queue.push(message);
    if (!this.active) void this.flush(speak);
  }

  private async flush(speak: (phrase: string) => Promise<void> | void): Promise<void> {
    this.active = true;
    while (this.queue.length > 0) await speak(this.queue.shift() as string);
    this.active = false;
  }
}
