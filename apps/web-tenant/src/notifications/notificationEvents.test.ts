import { describe, expect, it } from 'vitest';
import { NotificationDeduper, createNotificationEvent } from './notificationEvents';

describe('NotificationDeduper', () => {
  it('deduplicates by eventId', () => {
    const deduper = new NotificationDeduper();
    const event = createNotificationEvent({
      id: 'evt-1',
      type: 'order.created',
      orderId: 'order-1',
      title: 'Novo pedido',
      priority: 'critical',
      source: 'socket',
    });

    expect(deduper.shouldProcess(event, 1000)).toBe(true);
    expect(deduper.shouldProcess(event, 1001)).toBe(false);
  });

  it('deduplicates by orderId + type even with different event ids', () => {
    const deduper = new NotificationDeduper();
    const socketEvent = createNotificationEvent({
      id: 'socket-1',
      type: 'order.created',
      orderId: 'order-1',
      title: 'Novo pedido',
      priority: 'critical',
      source: 'socket',
    });
    const pollingEvent = createNotificationEvent({
      id: 'polling-1',
      type: 'order.created',
      orderId: 'order-1',
      title: 'Novo pedido',
      priority: 'critical',
      source: 'polling',
    });

    expect(deduper.shouldProcess(socketEvent, 1000)).toBe(true);
    expect(deduper.shouldProcess(pollingEvent, 1001)).toBe(false);
  });

  it('deduplicates order events when socket only has order number in the title', () => {
    const deduper = new NotificationDeduper();
    const socketEvent = createNotificationEvent({
      id: 'socket-ready-1',
      type: 'order.ready',
      title: 'Pedido #0003 pronto',
      priority: 'high',
      source: 'socket',
    });
    const pollingEvent = createNotificationEvent({
      id: 'polling-ready-1',
      type: 'order.ready',
      orderId: '#0003',
      title: 'Pedido #0003 pronto',
      priority: 'high',
      source: 'polling',
    });

    expect(deduper.shouldProcess(socketEvent, 1000)).toBe(true);
    expect(deduper.shouldProcess(pollingEvent, 1001)).toBe(false);
  });

  it('allows same order to notify again after dedupe ttl expires', () => {
    const deduper = new NotificationDeduper(60_000, 20_000);
    const event = createNotificationEvent({
      id: 'evt-1',
      type: 'order.cancelled',
      orderId: 'order-1',
      title: 'Pedido cancelado',
      priority: 'high',
      source: 'socket',
    });
    const laterEvent = createNotificationEvent({
      id: 'evt-2',
      type: 'order.cancelled',
      orderId: 'order-1',
      title: 'Pedido cancelado',
      priority: 'high',
      source: 'polling',
    });

    expect(deduper.shouldProcess(event, 1000)).toBe(true);
    expect(deduper.shouldProcess(laterEvent, 25_500)).toBe(true);
  });

  it('normalizes legacy aliases before dispatch', () => {
    const event = createNotificationEvent({
      id: 'legacy-1',
      type: 'order.new',
      orderId: 'order-1',
      title: 'Novo pedido',
      priority: 'critical',
      source: 'socket',
    });

    expect(event.type).toBe('order.created');
  });

  it('deduplicates simultaneous canonical and legacy events', () => {
    const deduper = new NotificationDeduper();
    const canonicalEvent = createNotificationEvent({
      id: 'socket:order.created:order-123',
      type: 'order.created',
      orderId: 'order-123',
      title: 'Novo pedido',
      priority: 'critical',
      source: 'socket',
    });

    // Simulate legacy event arriving
    const legacyEvent = createNotificationEvent({
      id: 'socket:newOrder:order-123',
      type: 'order.new' as import('../../../../packages/types/src/notifications').NotificationLegacyEvent, // correct legacy type
      orderId: 'order-123',
      title: 'Novo pedido',
      priority: 'critical',
      source: 'socket',
    });

    // The first one processed should pass, the second should be deduped
    expect(deduper.shouldProcess(canonicalEvent, 1000)).toBe(true);
    expect(deduper.shouldProcess(legacyEvent, 1001)).toBe(false);
  });

  it('rejects events that were already seen before a reconnection (same id)', () => {
    const deduper = new NotificationDeduper();
    const event1 = createNotificationEvent({
      id: 'socket:order.ready:999',
      type: 'order.ready',
      orderId: '999',
      title: 'Pedido pronto',
      priority: 'high',
      source: 'socket',
    });

    expect(deduper.shouldProcess(event1, 1000)).toBe(true);

    // Reconnection happens, same event arrives again 2 seconds later
    const event2 = { ...event1 };
    expect(deduper.shouldProcess(event2, 3000)).toBe(false);
  });
});
