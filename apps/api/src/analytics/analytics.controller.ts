import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AnalyticsService } from './analytics.service';
import { BusinessInsightsService } from './business-insights.service';
import { BusinessIntelligenceService } from './business-intelligence.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions, CurrentTenant } from '../common/decorators';
import { RequiresFeature } from '../common/decorators/requires-feature.decorator';
import { MetricFilterDTO, DashboardStatsDTO } from '@gestor/types';
import { AnalyticsPerformanceService, type AcquisitionQuery, type PerformanceQuery, type ProductsQuery } from './analytics-performance.service';

const performanceQuerySchema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), compare: z.enum(['true', 'false']).optional() }).strict();
const productsQuerySchema = performanceQuerySchema.extend({ limit: z.coerce.number().int().min(1).max(100).optional(), page: z.coerce.number().int().min(1).max(10000).optional(), sort: z.enum(['views', 'addToCart', 'ordersCompleted', 'quantityCompleted', 'realizedRevenue']).optional() }).strict();
const acquisitionQuerySchema = performanceQuerySchema.extend({ limit: z.coerce.number().int().min(1).max(100).optional(), page: z.coerce.number().int().min(1).max(10000).optional(), sort: z.enum(['sessions', 'menuViews', 'ordersSubmitted', 'ordersCompleted', 'conversionRate']).optional() }).strict();

@Controller('analytics')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('reports')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly businessInsightsService: BusinessInsightsService,
    private readonly businessIntelligenceService: BusinessIntelligenceService,
    private readonly performanceService: AnalyticsPerformanceService,
  ) {}

  @Get('performance/overview')
  @RequirePermissions('reports.read')
  getPerformanceOverview(@CurrentTenant() tenantId: string, @Query() query: Record<string, unknown>) {
    return this.performanceService.overview(tenantId, this.performanceQuery(query));
  }

  @Get('performance/funnel')
  @RequirePermissions('reports.read')
  getPerformanceFunnel(@CurrentTenant() tenantId: string, @Query() query: Record<string, unknown>) {
    return this.performanceService.funnel(tenantId, this.performanceQuery(query));
  }

  @Get('performance/products')
  @RequirePermissions('reports.read')
  getPerformanceProducts(@CurrentTenant() tenantId: string, @Query() query: Record<string, unknown>) {
    const parsed = this.parse(productsQuerySchema, query);
    const request: ProductsQuery = { from: parsed.from, to: parsed.to, compare: parsed.compare === 'true', limit: parsed.limit ?? 20, page: parsed.page ?? 1, sort: parsed.sort ?? 'realizedRevenue' };
    return this.performanceService.products(tenantId, request);
  }

  @Get('performance/acquisition')
  @RequirePermissions('reports.read')
  getPerformanceAcquisition(@CurrentTenant() tenantId: string, @Query() query: Record<string, unknown>) {
    const parsed = this.parse(acquisitionQuerySchema, query);
    const request: AcquisitionQuery = { from: parsed.from, to: parsed.to, compare: parsed.compare === 'true', limit: parsed.limit ?? 20, page: parsed.page ?? 1, sort: parsed.sort ?? 'sessions' };
    return this.performanceService.acquisition(tenantId, request);
  }

  private performanceQuery(query: Record<string, unknown>): PerformanceQuery { const parsed = this.parse(performanceQuerySchema, query); return { from: parsed.from, to: parsed.to, compare: parsed.compare === 'true' }; }
  private parse<T>(schema: z.ZodType<T>, query: Record<string, unknown>): T { const result = schema.safeParse(query); if (!result.success) throw new BadRequestException('invalid performance query'); return result.data; }

  @Get('dashboard')
  @RequirePermissions('reports.read')
  async getDashboardStats(
    @CurrentTenant() tenantId: string,
    @Query() filter: MetricFilterDTO
  ): Promise<DashboardStatsDTO> {
    const [operational, commercial, costs, financial] = await Promise.all([
      this.analyticsService.getOperationalMetrics(tenantId, filter),
      this.analyticsService.getCommercialMetrics(tenantId, filter),
      this.analyticsService.getCostMarginMetrics(tenantId, filter),
      this.analyticsService.getFinancialMetrics(tenantId, filter),
    ]);

    return { operational, commercial, costs, financial };
  }

  @Get('operational')
  @RequirePermissions('reports.read')
  async getOperational(
    @CurrentTenant() tenantId: string,
    @Query() filter: MetricFilterDTO
  ) {
    return this.analyticsService.getOperationalMetrics(tenantId, filter);
  }

  @Get('commercial')
  @RequirePermissions('reports.read')
  async getCommercial(
    @CurrentTenant() tenantId: string,
    @Query() filter: MetricFilterDTO
  ) {
    return this.analyticsService.getCommercialMetrics(tenantId, filter);
  }

  @Get('costs')
  @RequirePermissions('reports.view_costs')
  async getCosts(
    @CurrentTenant() tenantId: string,
    @Query() filter: MetricFilterDTO
  ) {
    return this.analyticsService.getCostMarginMetrics(tenantId, filter);
  }

  @Get('financial-metrics')
  @RequirePermissions('reports.read')
  async getFinancial(
    @CurrentTenant() tenantId: string,
    @Query() filter: MetricFilterDTO
  ) {
    return this.analyticsService.getFinancialMetrics(tenantId, filter);
  }

  @Get('insights')
  @RequirePermissions('reports.read')
  async getInsights(@CurrentTenant() tenantId: string) {
    return this.businessInsightsService.generateInsights(tenantId);
  }

  @Get('retention')
  @RequirePermissions('reports.read')
  async getRetention(@CurrentTenant() tenantId: string) {
    return this.businessInsightsService.getRetentionDashboard(tenantId);
  }

  @Get('business-intelligence')
  @RequiresFeature('bi_advanced')
  @RequirePermissions('reports.read')
  async getBusinessIntelligence(@CurrentTenant() tenantId: string) {
    const [dashboard, profitability, abcCurve, customerIntelligence, heatmap, forecast, products, campaigns, loyalty] =
      await Promise.all([
        this.businessIntelligenceService.getDashboard(tenantId),
        this.businessIntelligenceService.getProfitability(tenantId),
        this.businessIntelligenceService.getAbcCurve(tenantId),
        this.businessIntelligenceService.getCustomerIntelligence(tenantId),
        this.businessIntelligenceService.getHeatmap(tenantId),
        this.businessIntelligenceService.getForecast(tenantId),
        this.businessIntelligenceService.getProductDashboard(tenantId),
        this.businessIntelligenceService.getCampaignDashboard(tenantId),
        this.businessIntelligenceService.getLoyaltyDashboard(tenantId),
      ]);

    return {
      dashboard,
      profitability,
      abcCurve,
      customerIntelligence,
      heatmap,
      forecast,
      products,
      campaigns,
      loyalty,
    };
  }

  @Get('ai-insights')
  @RequirePermissions('reports.read')
  async getAiInsights(@CurrentTenant() tenantId: string) {
    return this.businessIntelligenceService.getAiInsights(tenantId);
  }
}
