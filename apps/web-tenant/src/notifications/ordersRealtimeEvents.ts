import type { OrderChangedEvent } from '@gestor/types';

export type OrdersRealtimeConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export type OrdersRealtimeEvent =
  | { type: 'connection'; state: OrdersRealtimeConnectionState; occurredAt: string }
  | { type: 'order.changed'; hint: OrderChangedEvent };

const EVENT_NAME = 'tenant:orders-realtime-event';
let connectionState: OrdersRealtimeConnectionState = 'connecting';

function target(): EventTarget {
  return typeof window === 'undefined' ? new EventTarget() : window;
}

export function getOrdersRealtimeConnectionState(): OrdersRealtimeConnectionState {
  return connectionState;
}

export function emitOrdersRealtimeEvent(event: OrdersRealtimeEvent): void {
  if (event.type === 'connection') connectionState = event.state;
  target().dispatchEvent(new CustomEvent<OrdersRealtimeEvent>(EVENT_NAME, { detail: event }));
}

export function subscribeOrdersRealtimeEvents(listener: (event: OrdersRealtimeEvent) => void): () => void {
  const eventTarget = target();
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<OrdersRealtimeEvent>).detail;
    if (detail) listener(detail);
  };
  eventTarget.addEventListener(EVENT_NAME, handler);
  return () => eventTarget.removeEventListener(EVENT_NAME, handler);
}
