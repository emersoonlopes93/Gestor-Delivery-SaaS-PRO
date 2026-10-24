import { OrderStatus } from './order';

export interface OrderBoardUpdatedEvent {
  tenantId: string;
  orderId: string;
  status: OrderStatus;
  updatedAt: string;
}

export type OrderChangedReason =
  | 'created'
  | 'status'
  | 'cancelled'
  | 'ready'
  | 'auto_accepted'
  | 'edited'
  | 'driver'
  | 'marketplace';

/**
 * Tenant-room reconciliation hint. The order detail endpoint remains the
 * source of truth; consumers must never apply this payload as order state.
 */
export interface OrderChangedEvent {
  eventId: string;
  orderId: string;
  occurredAt: string;
  reason: OrderChangedReason;
}

export interface DriverLocationUpdatedEvent {
  tenantId: string;
  driverId: string;
  runId?: string;
  lat: number;
  lng: number;
  lastLocationAt: string;
}

export type DriverDeliveryEventType =
  | 'delivery.assigned'
  | 'delivery.updated'
  | 'delivery.cancelled';

export interface DriverDeliveryEvent {
  eventId: string;
  type: DriverDeliveryEventType;
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  occurredAt: string;
}

export type DriverRouteEventType =
  | 'delivery.run_assigned'
  | 'delivery.run_updated'
  | 'delivery.stop_updated';

export type DriverRouteEventChange =
  | 'assigned'
  | 'reordered'
  | 'cancelled'
  | 'updated';

export interface DriverRouteEvent {
  eventId: string;
  type: DriverRouteEventType;
  change: DriverRouteEventChange;
  runId: string;
  stopId?: string;
  occurredAt: string;
}

export interface OrderStatusUpdatedEvent {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  publicTrackingToken?: string;
  note?: string;
}

export interface KitchenProductionEvent {
  tenantId: string;
  orderId: string;
  itemId: string;
  status: 'pending' | 'preparing' | 'ready';
  updatedAt: string;
}
