import { BadRequestException, Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { BillingService } from './billing.service';
import { BillingUsageService } from './billing-usage.service';
import type { CreatePlanDto, CreateSubscriptionDto, UpdatePlanDto, UpdateSubscriptionDto } from './dto/create-plan.dto';
import { TenantBillingResolverService } from './tenant-billing-resolver.service';
import { TenantBillingPortalService } from './tenant-billing-portal.service';
import { BillingAddonService } from './billing-addon.service';
import { BillingEntitlementsService } from './billing-entitlements.service';
import { BillingSettingsService } from './billing-settings.service';
import { BillingPaymentGatewayService } from './billing-payment-gateway.service';
import { PrismaService } from '../database/prisma.service';
import { TenantSubscriptionStatus } from '@prisma/client';

@Controller('billing')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
    private readonly billingUsageService: BillingUsageService,
    private readonly tenantBillingPortalService: TenantBillingPortalService,
    private readonly billingAddonService: BillingAddonService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    private readonly billingSettingsService: BillingSettingsService,
    private readonly billingPaymentGatewayService: BillingPaymentGatewayService,
    private readonly prisma: PrismaService,
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

  @Get('entitlements')
  @RequirePermissions('billing.read')
  async getEntitlements(@CurrentTenant() tenantId: string) {
    return this.billingEntitlementsService.resolveTenantEntitlements(tenantId);
  }

  @Get('partners')
  @RequirePermissions('billing.read')
  async getPartners(@CurrentTenant() tenantId: string) {
    const entitlements = await this.billingEntitlementsService.resolveTenantEntitlements(tenantId);
    return this.billingEntitlementsService.getPartnerLinks(entitlements.settings);
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

  @Post('trial-pro/start')
  @RequirePermissions('billing.write')
  async startTrialPro(@CurrentTenant() tenantId: string) {
    const settings = await this.billingSettingsService.ensureDefaultSettings();
    if (!settings.trialProEnabled) {
      throw new BadRequestException('Trial Pro desativado no SaaS Admin.');
    }

    const plan = await this.tenantBillingResolver.getDefaultBillingPlan();
    if (plan.requiresPaymentMethod) {
      const runtime = this.billingPaymentGatewayService.getRuntimeConfig();
      const paymentMethod = await this.prisma.billingPaymentMethod.findFirst({
        where: { tenantId, isActive: true, isDefault: true },
      });
      if (!runtime.paymentsEnabled || !paymentMethod) {
        throw new BadRequestException('Trial Pro com cartao ainda nao esta pronto neste ambiente. Mantenha a flag desabilitada ate o gateway real estar disponivel.');
      }
    }

    const subscription = await this.tenantBillingResolver.getOrCreateTenantBillingSubscription(tenantId, plan.id);
    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + Math.max(0, plan.trialDays));

    await this.prisma.tenantBillingSubscription.update({
      where: { id: subscription.id },
      data: {
        status: TenantSubscriptionStatus.trialing,
        trialStartedAt: now,
        trialEndsAt,
        requiresPaymentMethod: plan.requiresPaymentMethod,
      },
    });

    return this.tenantBillingPortalService.getMyBillingOverview(tenantId);
  }

  @Post('addons/ai-agent/activate')
  @RequirePermissions('billing.write')
  async activateAiAddon(@CurrentTenant() tenantId: string) {
    await this.billingAddonService.activateAiAddon(tenantId);
    return this.tenantBillingPortalService.getMyBillingOverview(tenantId);
  }

  @Post('addons/ai-agent/cancel')
  @RequirePermissions('billing.write')
  async cancelAiAddon(@CurrentTenant() tenantId: string) {
    await this.billingAddonService.cancelAiAddon(tenantId);
    return this.tenantBillingPortalService.getMyBillingOverview(tenantId);
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
