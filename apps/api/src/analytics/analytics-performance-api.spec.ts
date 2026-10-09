import { AnalyticsPerformanceService } from './analytics-performance.service';

describe('AnalyticsPerformanceService', () => {
  const prisma = {
    tenantSettings: { findUnique: jest.fn() },
    analyticsDailyAggregate: { findMany: jest.fn() },
    order: { aggregate: jest.fn(), count: jest.fn() },
    orderItem: { groupBy: jest.fn() },
    product: { findMany: jest.fn() },
  };
  const service = new AnalyticsPerformanceService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tenantSettings.findUnique.mockResolvedValue({ timezone: 'America/Sao_Paulo' });
    prisma.analyticsDailyAggregate.findMany.mockResolvedValue([]);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: null }, _count: { _all: 0 } });
    prisma.order.count.mockResolvedValue(0);
    prisma.orderItem.groupBy.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
  });

  it('uses authenticated tenant scope, stable empty metrics and authoritative revenue', async () => {
    prisma.analyticsDailyAggregate.findMany.mockResolvedValue([
      { eventName: 'menu_viewed', eventCount: 4, uniqueSessions: 2 },
      { eventName: 'order_submitted', eventCount: 1, uniqueSessions: 1 },
    ]);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: { toString: () => '25.50' } }, _count: { _all: 1 } });
    const response = await service.overview('tenant-a', { from: '2026-07-01', to: '2026-07-01', compare: false });
    expect(response.current.realizedRevenue).toBe(25.5);
    expect(response.current.averageOrderValue).toBe(25.5);
    expect(response.current.storefrontConversionRate).toBe(0.5);
    expect(response.previous).toBeNull();
    expect(prisma.analyticsDailyAggregate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a' }) }));
    expect(prisma.order.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', status: 'completed' }) }));
  });

  it('keeps tagged acquisition explicitly partial and never invents direct or revenue', async () => {
    prisma.analyticsDailyAggregate.findMany.mockResolvedValue([
      { dimensionType: 'utm_source', dimensionKey: 'google', eventName: 'menu_viewed', eventCount: 3, uniqueSessions: 2 },
      { dimensionType: 'utm_source', dimensionKey: 'google', eventName: 'order_submitted', eventCount: 1, uniqueSessions: 1 },
    ]);
    const response = await service.acquisition('tenant-a', { from: '2026-07-01', to: '2026-07-01', compare: false, limit: 20, page: 1, sort: 'sessions' });
    expect(response.attribution).toEqual({ attributionStatus: 'partial', coverage: 'utm_tagged_only', directUnknownAvailable: false, revenueAttributionAvailable: false });
    expect(response.current.items).toEqual([expect.objectContaining({ dimensionType: 'utm_source', dimensionKey: 'google', realizedRevenue: null })]);
    expect(response.current.items.some((item) => item.dimensionKey === 'direct' || item.dimensionKey === 'unknown')).toBe(false);
    expect(prisma.analyticsDailyAggregate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a', dimensionType: { in: ['utm_source', 'utm_medium', 'utm_campaign'] } }) }));
  });

  it('rejects invalid and unbounded periods', async () => {
    await expect(service.overview('tenant-a', { from: '2026-07-02', to: '2026-07-01', compare: false })).rejects.toThrow('from must be on or before to');
    await expect(service.overview('tenant-a', { from: '2026-01-01', to: '2026-05-01', compare: false })).rejects.toThrow('range must not exceed 90 days');
  });
});
