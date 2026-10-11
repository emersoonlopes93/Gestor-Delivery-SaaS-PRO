import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../common/decorators';
import { REQUIRES_FEATURE_KEY } from '../common/decorators/requires-feature.decorator';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsPerformanceService } from './analytics-performance.service';
import { AnalyticsService } from './analytics.service';
import { BusinessInsightsService } from './business-insights.service';
import { BusinessIntelligenceService } from './business-intelligence.service';
import { RbacService } from '../rbac/rbac.service';

describe('AnalyticsController sensitive data authorization', () => {
  const filter = { startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-02T00:00:00.000Z' };

  const createController = (canViewCosts: boolean) => {
    const analytics = Object.assign(Object.create(AnalyticsService.prototype) as AnalyticsService, {
      getOperationalMetrics: jest.fn().mockResolvedValue({ operational: true }),
      getCommercialMetrics: jest.fn().mockResolvedValue({ commercial: true }),
      getCostMarginMetrics: jest.fn().mockResolvedValue({ estimatedCMV: 100, estimatedGrossMargin: 50 }),
      getFinancialMetrics: jest.fn().mockResolvedValue({ financial: true }),
    });
    const businessIntelligence = Object.assign(Object.create(BusinessIntelligenceService.prototype) as BusinessIntelligenceService, {
      getDashboard: jest.fn().mockResolvedValue({ dashboard: true }),
      getProfitability: jest.fn().mockResolvedValue({ profitability: true }),
      getAbcCurve: jest.fn().mockResolvedValue({ abcCurve: true }),
      getCustomerIntelligence: jest.fn().mockResolvedValue({ customers: true }),
      getHeatmap: jest.fn().mockResolvedValue({ heatmap: true }),
      getForecast: jest.fn().mockResolvedValue({ forecast: true }),
      getProductDashboard: jest.fn().mockResolvedValue({ products: true }),
      getCampaignDashboard: jest.fn().mockResolvedValue({ campaigns: true }),
      getLoyaltyDashboard: jest.fn().mockResolvedValue({ loyalty: true }),
      getAiInsights: jest.fn().mockResolvedValue({ insights: [] }),
    });
    const rbac = Object.assign(Object.create(RbacService.prototype) as RbacService, {
      hasPermissionOrElevatedRole: jest.fn().mockResolvedValue(canViewCosts),
    });

    const controller = new AnalyticsController(
      analytics,
      Object.create(BusinessInsightsService.prototype) as BusinessInsightsService,
      businessIntelligence,
      Object.create(AnalyticsPerformanceService.prototype) as AnalyticsPerformanceService,
      rbac,
    );

    return { controller, analytics, businessIntelligence, rbac };
  };

  it('keeps commercial dashboard metrics and omits cost and margin data without reports.view_costs', async () => {
    const { controller, analytics, rbac } = createController(false);

    await expect(controller.getDashboardStats('tenant-a', 'reports-reader', filter)).resolves.toEqual({
      operational: { operational: true },
      commercial: { commercial: true },
      financial: { financial: true },
    });
    expect(rbac.hasPermissionOrElevatedRole).toHaveBeenCalledWith('reports-reader', 'reports.view_costs');
    expect(analytics.getCostMarginMetrics).not.toHaveBeenCalled();
    expect(analytics.getOperationalMetrics).toHaveBeenCalledWith('tenant-a', filter);
  });

  it('returns cost and margin data to a reports reader with reports.view_costs', async () => {
    const { controller, analytics } = createController(true);

    const response = await controller.getDashboardStats('tenant-a', 'cost-reader', filter);

    expect(response.costs).toEqual({ estimatedCMV: 100, estimatedGrossMargin: 50 });
    expect(analytics.getCostMarginMetrics).toHaveBeenCalledWith('tenant-a', filter);
  });

  it('does not invoke profitability, profit ABC, or product margin services for a restricted BI reader', async () => {
    const { controller, businessIntelligence } = createController(false);

    await expect(controller.getBusinessIntelligence('tenant-a', 'reports-reader')).resolves.toEqual({
      dashboard: { dashboard: true },
      customerIntelligence: { customers: true },
      heatmap: { heatmap: true },
      forecast: { forecast: true },
      campaigns: { campaigns: true },
      loyalty: { loyalty: true },
    });
    expect(businessIntelligence.getProfitability).not.toHaveBeenCalled();
    expect(businessIntelligence.getAbcCurve).not.toHaveBeenCalled();
    expect(businessIntelligence.getProductDashboard).not.toHaveBeenCalled();
    expect(businessIntelligence.getDashboard).toHaveBeenCalledWith('tenant-a');
  });

  it('keeps the complete BI payload for a reader allowed to view costs', async () => {
    const { controller, businessIntelligence } = createController(true);

    const response = await controller.getBusinessIntelligence('tenant-a', 'cost-reader');

    expect(response).toMatchObject({
      profitability: { profitability: true },
      abcCurve: { abcCurve: true },
      products: { products: true },
    });
    expect(businessIntelligence.getProfitability).toHaveBeenCalledWith('tenant-a');
  });

  it('does not expose profitability-based AI insights without reports.view_costs', async () => {
    const { controller, businessIntelligence } = createController(false);

    await expect(controller.getAiInsights('tenant-a', 'reports-reader')).rejects.toBeInstanceOf(ForbiddenException);
    expect(businessIntelligence.getAiInsights).not.toHaveBeenCalled();
  });

  it('preserves reports.read on BI and the cost-only gate on the costs route', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AnalyticsController.prototype.getBusinessIntelligence)).toEqual(['reports.read']);
    expect(Reflect.getMetadata(REQUIRES_FEATURE_KEY, AnalyticsController.prototype.getBusinessIntelligence)).toBe('bi_advanced');
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AnalyticsController.prototype.getCosts)).toEqual(['reports.view_costs']);
  });
});
