import { MarketplaceProvider } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService commercial marketplace metrics', () => {
  it('keeps completed gross sales separate from the persisted 99Food net receivable', async () => {
    const marketplaceBillEntry = {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { settlementAmount: 18_640n },
        _count: { _all: 2 },
      }),
    };
    const prisma = {
      tenantClient: {
        order: {
          findMany: jest.fn().mockResolvedValue([
            { total: 120, sourceChannel: 'marketplace_99food', discountTotal: 0, coupon: null, items: [] },
            { total: 120, sourceChannel: 'marketplace_99food', discountTotal: 0, coupon: null, items: [] },
          ]),
        },
      },
      marketplaceBillEntry,
    };
    const service = new AnalyticsService(prisma as never);
    Object.defineProperties(service, {
      getRevenueByCategory: { value: jest.fn().mockResolvedValue({}) },
      getTopProducts: { value: jest.fn().mockResolvedValue([]) },
      getTopCombos: { value: jest.fn().mockResolvedValue([]) },
      getCashbackStats: { value: jest.fn().mockResolvedValue({ earnedTotal: 0, redeemedTotal: 0 }) },
    });

    const metrics = await service.getCommercialMetrics('tenant-1', {
      startDate: '2026-09-16T00:00:00.000Z',
      endDate: '2026-09-16T23:59:59.999Z',
    });

    expect(metrics).toMatchObject({
      totalRevenue: 240,
      food99EstimatedNetReceivable: 186.4,
      food99BillEntryCount: 2,
    });
    expect(marketplaceBillEntry.aggregate).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        provider: MarketplaceProvider.FOOD_99,
        businessAt: {
          gte: new Date('2026-09-16T00:00:00.000Z'),
          lte: new Date('2026-09-16T23:59:59.999Z'),
        },
      },
      _sum: { settlementAmount: true },
      _count: { _all: true },
    });
  });

  it('keeps the net receivable unavailable when no Bill Data exists', async () => {
    const prisma = {
      tenantClient: { order: { findMany: jest.fn().mockResolvedValue([]) } },
      marketplaceBillEntry: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { settlementAmount: null },
          _count: { _all: 0 },
        }),
      },
    };
    const service = new AnalyticsService(prisma as never);
    Object.defineProperties(service, {
      getRevenueByCategory: { value: jest.fn().mockResolvedValue({}) },
      getTopProducts: { value: jest.fn().mockResolvedValue([]) },
      getTopCombos: { value: jest.fn().mockResolvedValue([]) },
      getCashbackStats: { value: jest.fn().mockResolvedValue({ earnedTotal: 0, redeemedTotal: 0 }) },
    });

    await expect(service.getCommercialMetrics('tenant-1', {
      startDate: '2026-09-16T00:00:00.000Z',
      endDate: '2026-09-16T23:59:59.999Z',
    })).resolves.toMatchObject({
      food99EstimatedNetReceivable: null,
      food99BillEntryCount: 0,
    });
  });
});
