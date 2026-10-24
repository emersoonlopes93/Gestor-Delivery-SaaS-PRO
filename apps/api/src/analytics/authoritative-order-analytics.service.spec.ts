import { OrderStatus } from '@prisma/client';
import { AuthoritativeOrderAnalyticsService } from './authoritative-order-analytics.service';

describe('AuthoritativeOrderAnalyticsService', () => {
  const createMany = jest.fn();
  const tx = { analyticsEvent: { createMany } };
  const service = new AuthoritativeOrderAnalyticsService();
  const base = {
    tenantId: 'tenant-a',
    orderId: 'order-a',
    orderTotal: 42.5,
    occurredAt: new Date('2026-07-29T12:00:00.000Z'),
    tx: tx as never,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createMany.mockResolvedValue({ count: 1 });
  });

  it.each([
    [OrderStatus.confirmed, 'order_confirmed'],
    [OrderStatus.completed, 'order_completed'],
    [OrderStatus.cancelled, 'order_cancelled'],
  ] as const)('records %s as a server event', async (orderStatus, eventName) => {
    await service.recordOrderStatusEvent({ ...base, orderStatus });

    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: expect.objectContaining({
        tenantId: 'tenant-a',
        orderId: 'order-a',
        eventName,
        source: 'server',
        schemaVersion: 1,
        value: 42.5,
        currency: 'BRL',
        consentAnalytics: true,
        consentMarketing: false,
      }),
    }));
  });

  it('uses a stable event id so a repeated transition is database-idempotent', async () => {
    await service.recordOrderStatusEvent({ ...base, orderStatus: OrderStatus.completed });
    const firstEventId = createMany.mock.calls[0][0].data.eventId as string;
    await service.recordOrderStatusEvent({ ...base, orderStatus: OrderStatus.completed });
    const secondEventId = createMany.mock.calls[1][0].data.eventId as string;

    expect(secondEventId).toBe(firstEventId);
    expect(firstEventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not create an authoritative event for non-terminal analytics statuses', async () => {
    await service.recordOrderStatusEvent({ ...base, orderStatus: OrderStatus.preparing });
    expect(createMany).not.toHaveBeenCalled();
  });
});
