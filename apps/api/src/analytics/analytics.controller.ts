import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { BusinessInsightsService } from './business-insights.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions, CurrentTenant } from '../common/decorators';
import { MetricFilterDTO, DashboardStatsDTO } from '@gestor/types';

@Controller('analytics')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly businessInsightsService: BusinessInsightsService,
  ) {}

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
}
