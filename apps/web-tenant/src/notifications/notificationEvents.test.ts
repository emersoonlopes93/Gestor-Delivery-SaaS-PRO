import { describe, expect, it } from 'vitest';
import { NotificationDeduper, createNotificationEvent } from './notificationEvents';

describe('NotificationDeduper', () => {
  it('deduplicates by eventId', () => {
    const deduper = new NotificationDeduper();
    const event = createNotificationEvent({
      id: 'evt-1',
      type: 'order.new',
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
      type: 'order.new',
      orderId: 'order-1',
      title: 'Novo pedido',
      priority: 'critical',
      source: 'socket',
    });
    const pollingEvent = createNotificationEvent({
      id: 'polling-1',
      type: 'order.new',
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
      type: 'order.kds_ready',
      title: 'Pedido #0003 pronto',
      priority: 'high',
      source: 'socket',
    });
    const pollingEvent = createNotificationEvent({
      id: 'polling-ready-1',
      type: 'order.kds_ready',
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
});
