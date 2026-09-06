import { OrdersGateway } from './orders.gateway';

describe('OrdersGateway order.changed', () => {
  it('emits a reconciliation hint only to the tenant room', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-06T15:00:00.000Z'));
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const gateway = new OrdersGateway({} as never, {} as never);
    gateway.server = { to } as never;

    gateway.emitOrderChanged('tenant-a', 'order-a', 'status');

    expect(to).toHaveBeenCalledWith('tenant:tenant-a');
    expect(emit).toHaveBeenCalledWith('order.changed', {
      eventId: 'order.changed:order-a:status:2026-09-06T15:00:00.000Z',
      orderId: 'order-a',
      occurredAt: '2026-09-06T15:00:00.000Z',
      reason: 'status',
    });
    jest.useRealTimers();
  });
});
