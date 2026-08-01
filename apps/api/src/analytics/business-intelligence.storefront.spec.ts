import { PrismaService } from '../database/prisma.service';
import { AnalyticsService } from './analytics.service';
import { BusinessInsightsService } from './business-insights.service';
import { CustomerIntelligenceService } from '../crm/customer-intelligence.service';
import { CampaignsService } from '../campaigns/services/campaigns.service';
import { BusinessIntelligenceService } from './business-intelligence.service';

describe('BusinessIntelligenceService storefront best sellers', () => {
  afterEach(() => jest.useRealTimers());

  it('uses completed tenant orders in the 30-day window and deterministic quantity ranking', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    const orderFindMany = jest.fn().mockResolvedValue([{ id: 'order-a' }]);
    const orderItemGroupBy = jest.fn().mockResolvedValue([
      { productId: 'b', snapshotName: 'B', _sum: { quantity: 3, lineTotal: 30 } },
      { productId: 'a', snapshotName: 'A', _sum: { quantity: 3, lineTotal: 30 } },
      { productId: 'c', snapshotName: 'C', _sum: { quantity: 2, lineTotal: 100 } },
    ]);
    const prisma = Object.assign(Object.create(PrismaService.prototype) as PrismaService, {
      order: { findMany: orderFindMany },
      orderItem: { groupBy: orderItemGroupBy },
      productRecipeIngredient: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const service = new BusinessIntelligenceService(
      prisma,
      Object.create(AnalyticsService.prototype) as AnalyticsService,
      Object.create(BusinessInsightsService.prototype) as BusinessInsightsService,
      Object.create(CustomerIntelligenceService.prototype) as CustomerIntelligenceService,
      Object.create(CampaignsService.prototype) as CampaignsService,
    );

    await expect(service.getStorefrontBestSellers('tenant-a', 30, 3)).resolves.toEqual(['a', 'b', 'c']);
    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        status: 'completed',
        createdAt: {
          gte: new Date(2026, 6, 2, 0, 0, 0, 0),
          lte: new Date(2026, 7, 1, 23, 59, 59, 999),
        },
      }),
    }));
    expect(orderItemGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', orderId: { in: ['order-a'] } }),
    }));
  });
});
