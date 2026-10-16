import { AnalyticsService } from './analytics.service';

describe('AnalyticsService cost margin COGS', () => {
  it('excludes theoretical depletion from cancelled orders while retaining the historical movement', async () => {
    const stockMovementFindMany = jest.fn().mockResolvedValue([
      { quantity: 2, unitCost: 5 },
    ]);
    const prisma = {
      stockMovement: { findMany: stockMovementFindMany },
      order: { aggregate: jest.fn().mockResolvedValue({ _sum: { total: 40 } }) },
    };
    const service = new AnalyticsService(prisma as never);
    Object.defineProperties(service, {
      getProductPerformance: { value: jest.fn().mockResolvedValue([]) },
      getCategoryPerformance: { value: jest.fn().mockResolvedValue([]) },
      getChannelPerformance: { value: jest.fn().mockResolvedValue([]) },
    });

    const metrics = await service.getCostMarginMetrics('tenant-a', {
      startDate: '2026-09-01T00:00:00.000Z',
      endDate: '2026-09-01T23:59:59.999Z',
    });

    expect(stockMovementFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        type: 'theoretical_depletion',
        order: { is: { status: { not: 'cancelled' } } },
      }),
    }));
    expect(metrics).toMatchObject({ estimatedCMV: 10, estimatedGrossMargin: 30 });
  });
});
