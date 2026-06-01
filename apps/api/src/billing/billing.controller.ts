import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { BillingService } from './billing.service';
import { BillingUsageService } from './billing-usage.service';
import type { CreatePlanDto, CreateSubscriptionDto, UpdatePlanDto, UpdateSubscriptionDto } from './dto/create-plan.dto';
import { TenantBillingResolverService } from './tenant-billing-resolver.service';
import { TenantBillingPortalService } from './tenant-billing-portal.service';

@Controller('billing')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
    private readonly billingUsageService: BillingUsageService,
    private readonly tenantBillingPortalService: TenantBillingPortalService,
  ) {}

  @Get('me')
  @RequirePermissions('billing.read')
  async getMyBillingOverview(@CurrentTenant() tenantId: string) {
    return this.tenantBillingPortalService.getMyBillingOverview(tenantId);
  }

  @Get('me/invoices')
  @RequirePermissions('billing.read')
  async listMyInvoices(@CurrentTenant() tenantId: string) {
    return this.tenantBillingPortalService.listMyInvoices(tenantId);
  }

  @Get('me/invoices/:invoiceId')
  @RequirePermissions('billing.read')
  async getMyInvoiceDetails(
    @CurrentTenant() tenantId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.tenantBillingPortalService.getMyInvoiceDetails(tenantId, invoiceId);
  }

  @Get('plans')
  async listPlans() {
    return [await this.tenantBillingResolver.getDefaultBillingPlan()];
  }

  @Post('plans')
  @RequirePermissions('billing.write')
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.billingService.createPlan(dto);
  }

  @Put('plans/:id')
  @RequirePermissions('billing.write')
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.billingService.updatePlan(id, dto);
  }

  @Get('subscription')
  async getCurrentSubscription(@CurrentTenant() tenantId: string) {
    return this.tenantBillingResolver.getTenantBillingState(tenantId);
  }

  @Get('state')
  async getBillingState(@CurrentTenant() tenantId: string) {
    return this.tenantBillingResolver.getTenantBillingState(tenantId);
  }

  @Get('usage-preview')
  @RequirePermissions('billing.read')
  async getUsagePreview(@CurrentTenant() tenantId: string) {
    const state = await this.tenantBillingResolver.getTenantBillingState(tenantId);
    const now = new Date();
    const periodStart = state.subscription?.currentCycleStartedAt
      ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = state.subscription?.currentCycleEndsAt
      ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    return this.billingUsageService.getBillableRevenuePreview({
      tenantId,
      periodStart,
      periodEnd,
      planId: state.plan?.id,
    });
  }

  @Post('subscription')
  async createSubscription(
    @Body() dto: Omit<CreateSubscriptionDto, 'tenantId'>,
    @CurrentTenant() tenantId: string,
  ) {
    const subscription = await this.tenantBillingResolver.getOrCreateTenantBillingSubscription(tenantId, dto.planId);
    return this.tenantBillingResolver.getTenantBillingState(subscription.tenantId);
  }

  @Put('subscription')
  async updateSubscription(
    @Body() dto: UpdateSubscriptionDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.billingService.updateSubscription(tenantId, dto);
  }

  @Get('access-check')
  @RequirePermissions('billing.read')
  async checkAccess(@CurrentTenant() tenantId: string) {
    const state = await this.tenantBillingResolver.getTenantBillingState(tenantId);
    return {
      canAccess: true,
      reason: null,
      state,
      enforcement: 'disabled',
    };
  }
}
