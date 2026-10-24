import { describe, expect, it, vi } from 'vitest';
import type { DriverDeliveryEvent } from '@gestor/types';
import { processDriverDeliveryEvent } from './driverDeliveryEvents';

describe('driver delivery event reliability', () => {
  it('updates the UI and sounds exactly once for a duplicated assignment', () => {
    const event: DriverDeliveryEvent = {
      eventId: 'delivery.assigned:order-a:1',
      type: 'delivery.assigned',
      orderId: 'order-a',
      orderNumber: '101',
      status: 'ready_for_delivery',
      occurredAt: '2026-08-11T00:00:00.000Z',
    };
    const onEvent = vi.fn();
    const onAssignment = vi.fn();

    expect(processDriverDeliveryEvent(event, { onEvent, onAssignment })).toBe(true);
    expect(processDriverDeliveryEvent(event, { onEvent, onAssignment })).toBe(false);
    expect(onEvent).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledWith(event);
    expect(onAssignment).toHaveBeenCalledOnce();
  });

  it('does not sound for updates or cancellations', () => {
    const onEvent = vi.fn();
    const onAssignment = vi.fn();
    for (const type of ['delivery.updated', 'delivery.cancelled'] as const) {
      processDriverDeliveryEvent({
        eventId: `${type}:order-b:1`,
        type,
        orderId: 'order-b',
        orderNumber: '102',
        status: type === 'delivery.cancelled' ? 'cancelled' : 'out_for_delivery',
        occurredAt: '2026-08-11T00:00:00.000Z',
      }, { onEvent, onAssignment });
    }
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onAssignment).not.toHaveBeenCalled();
  });
});
