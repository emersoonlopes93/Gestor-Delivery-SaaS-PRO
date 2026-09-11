import type { OrderBoardItemDTO, OrderOperationalAction, OrderStatus } from '@gestor/types';

export type OrderManagerLane = 'kitchen' | 'ready' | 'route' | 'finalization';

export const ORDER_MANAGER_LANES: readonly { id: OrderManagerLane; label: string; statuses: readonly OrderStatus[]; description: string }[] = [
  { id: 'kitchen', label: 'Cozinha', statuses: ['pending', 'confirmed', 'preparing'], description: 'Entrada e preparo' },
  { id: 'ready', label: 'Prontos', statuses: ['ready_for_pickup', 'ready_for_delivery'], description: 'Retirada ou despacho' },
  { id: 'route', label: 'Em rota', statuses: ['out_for_delivery'], description: 'Acompanhamento logístico' },
  { id: 'finalization', label: 'Finalização', statuses: ['completed', 'cancelled'], description: 'Estados terminais' },
] as const;

export function groupOrdersForManager(orders: readonly OrderBoardItemDTO[]): Record<OrderManagerLane, OrderBoardItemDTO[]> {
  const groups: Record<OrderManagerLane, OrderBoardItemDTO[]> = { kitchen: [], ready: [], route: [], finalization: [] };
  for (const order of orders) {
    const lane = ORDER_MANAGER_LANES.find((candidate) => candidate.statuses.includes(order.status));
    if (lane) groups[lane.id].push(order);
  }
  return groups;
}

export function filterManagerOrders(orders: readonly OrderBoardItemDTO[], query: string, origin: string): OrderBoardItemDTO[] {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  return orders.filter((order) => {
    const matchesOrigin = origin === 'all' || order.operational.origin === origin;
    if (!matchesOrigin) return false;
    if (!normalized) return true;
    return [order.orderNumber, order.customerName, order.customerPhone, order.deliveryDriverName]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase('pt-BR').includes(normalized));
  });
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
