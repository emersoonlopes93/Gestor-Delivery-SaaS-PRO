import { OrderStatus } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

const filter = {
  startDate: '2026-10-01T00:00:00.000Z',
  endDate: '2026-10-01T23:59:59.999Z',
};

function makeService(orders: Array<Record<string, unknown>>) {
  const prisma = {
    tenantClient: {
      order: {
        findMany: jest.fn()
          .mockResolvedValueOnce(orders)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      cashbackTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
    },
  };
  return { prisma, service: new AnalyticsService(prisma as never) };
}

describe('AnalyticsService dashboard commercial metrics', () => {
  it('uses the persisted marketplace order total, scoped to completed orders in the tenant', async () => {
    const { prisma, service } = makeService([{
      id: 'marketplace-order-1',
      total: '47.50',
      sourceChannel: 'marketplace_99food',
      coupon: null,
      discountTotal: 0,
    }]);

    await expect(service.getCommercialMetrics('tenant-1', filter)).resolves.toMatchObject({
      totalRevenue: 47.5,
      totalOrders: 1,
      averageTicket: 47.5,
      revenueByChannel: { marketplace_99food: 47.5 },
    });
    expect(prisma.tenantClient.order.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1',
        status: OrderStatus.completed,
        createdAt: { gte: new Date(filter.startDate), lte: new Date(filter.endDate) },
      }),
    }));
    expect((prisma.tenantClient as Record<string, unknown>).product).toBeUndefined();
  });

  it('returns zero instead of NaN or Infinity when no completed orders exist', async () => {
    const { service } = makeService([]);

    await expect(service.getCommercialMetrics('tenant-1', filter)).resolves.toMatchObject({
      totalRevenue: 0,
      totalOrders: 0,
      averageTicket: 0,
    });
  });
});
