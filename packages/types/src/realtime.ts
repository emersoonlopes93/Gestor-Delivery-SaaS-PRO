import { OrderStatus } from './order';

export interface OrderBoardUpdatedEvent {
  tenantId: string;
  orderId: string;
  status: OrderStatus;
  updatedAt: string;
}

export interface KdsOrderUpdatedEvent {
  tenantId: string;
  orderId: string;
  kitchenStatus: string;
  updatedAt: string;
}

export interface DriverLocationUpdatedEvent {
  tenantId: string;
  driverId: string;
  lat: number;
  lng: number;
  lastLocationAt: string;
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
