import type { OrderBoardItemDTO, OrderChangedEvent, OrderResponseDTO, OrderStatus } from '@gestor/types';

export const ORDERS_CONNECTED_RECONCILIATION_MS = 90_000;
export const ORDERS_DISCONNECTED_RECONCILIATION_MS = 30_000;
export const ORDERS_STALE_AFTER_MS = 120_000;

const ACTIVE_BOARD_STATUSES = new Set<OrderStatus>([
  'pending',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'ready_for_delivery',
  'out_for_delivery',
]);

export function isActiveBoardStatus(status: OrderStatus): boolean {
  return ACTIVE_BOARD_STATUSES.has(status);
}

export function orderDetailToBoardItem(order: OrderResponseDTO): OrderBoardItemDTO | null {
  if (!isActiveBoardStatus(order.status) || !order.operational) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    total: order.total,
    itemsSubtotal: order.itemsSubtotal,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    itemsSummary: order.items.map((item) => `${item.quantity}x ${item.snapshotName}`).join(', '),
    sourceChannel: order.sourceChannel,
    createdAt: order.createdAt,
    notes: order.notes,
    deliveryDriverId: order.deliveryDriverId ?? undefined,
    deliveryDriverName: order.deliveryDriverName ?? undefined,
    deliveryDriverStatus: order.deliveryDriverStatus ?? undefined,
    scheduledFor: order.scheduledFor,
    isScheduled: order.isScheduled,
    operational: order.operational,
  };
}

export function reconcileBoardOrder(
  current: OrderBoardItemDTO[],
  orderId: string,
  next: OrderBoardItemDTO | null,
): OrderBoardItemDTO[] {
  const existingIndex = current.findIndex((order) => order.id === orderId);
  if (!next) {
    return existingIndex < 0 ? current : current.filter((order) => order.id !== orderId);
  }
  if (existingIndex >= 0) {
    const updated = [...current];
    updated[existingIndex] = next;
    return updated;
  }

  const insertionIndex = current.findIndex((order) => order.createdAt > next.createdAt);
  if (insertionIndex < 0) return [...current, next];
  return [...current.slice(0, insertionIndex), next, ...current.slice(insertionIndex)];
}

export function latestHintForOrder(
  current: OrderChangedEvent | undefined,
  incoming: OrderChangedEvent,
): OrderChangedEvent {
  if (!current) return incoming;
  return current.occurredAt <= incoming.occurredAt ? incoming : current;
}

export function isOrdersSnapshotStale(lastConfirmedAt: number | null, now = Date.now()): boolean {
  return lastConfirmedAt !== null && now - lastConfirmedAt >= ORDERS_STALE_AFTER_MS;
}
