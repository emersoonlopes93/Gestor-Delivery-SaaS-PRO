import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RequireAdminPermissions } from '../../common/decorators';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { BillingService } from '../../billing/billing.service';
import { CreatePlanDto, UpdatePlanDto } from '../../billing/dto/create-plan.dto';
import { BillingUsageService } from '../../billing/billing-usage.service';
import { BillingCycleService } from '../../billing/billing-cycle.service';
import { PrismaService } from '../../database/prisma.service';
import { BillingSettingsService } from '../../billing/billing-settings.service';
import { BillingPaymentAttemptService } from '../../billing/billing-payment-attempt.service';
import { BillingPaymentGatewayService } from '../../billing/billing-payment-gateway.service';
import { BillingGatewayMode, PaymentProvider, Prisma } from '@prisma/client';
import { TenantBillingResolverService } from '../../billing/tenant-billing-resolver.service';
import { normalizeSeededRevenueTierLabel } from '../../billing/revenue-tier-label';
import { RevenueLedgerService } from '../../billing/revenue-ledger.service';
import { BillingAddonService } from '../../billing/billing-addon.service';

type BillingRevenueTierInput = {
  id?: string;
  minRevenue?: string | number;
  maxRevenue?: string | number | null;
  price?: string | number;
  label?: string | null;
};

type UpdateBillingPlanV2Body = {
  name?: string;
  description?: string | null;
  trialDays?: number;
  requiresPaymentMethod?: boolean;
  allowAllModules?: boolean;
  isActive?: boolean;
  isPublic?: boolean;
  tiers?: BillingRevenueTierInput[];
};

type UpdateBillingSettingsBody = {
  freeTierRevenueLimit?: string | number;
  maxMonthlyCharge?: string | number;
  trialProEnabled?: boolean;
  trialProDays?: number;
  trialRequiresPaymentMethod?: boolean;
  trialIncludesAi?: boolean;
  trialIncludesIfood?: boolean;
  trialIncludesAdvancedReports?: boolean;
  trialAutoConvertToBilling?: boolean;
  aiAddonEnabled?: boolean;
  aiAddonPrice?: string | number;
  aiFreeTrialMessages?: number;
  aiIncludedForPaidTenants?: boolean;
  aiIncludedMonthlyMessages?: number;
  aiHardLimitMonthlyMessages?: number;
  countMarketplaceOrdersDefault?: boolean;
  partnerLinksJson?: Prisma.InputJsonValue;
  includeDeliveryFeeByDefault?: boolean;
  includeServiceFeeByDefault?: boolean;
  countStorefrontOrders?: boolean;
  countDirectOnlineOrders?: boolean;
  countPosOrders?: boolean;
  countWhatsappAiOrders?: boolean;
  countManualOrders?: boolean;
  countMarketplaceIfoodOrders?: boolean;
  countMarketplaceRappiOrders?: boolean;
  countMarketplaceUbereatsOrders?: boolean;
  countMarketplace99foodOrders?: boolean;
  countMarketplaceKettaOrders?: boolean;
  countMarketplaceZeDeliveryOrders?: boolean;
  countConfirmedOrders?: boolean;
  countCompletedOrders?: boolean;
  excludeCancelledOrders?: boolean;
  discountReducesRevenue?: boolean;
  defaultGracePeriodDays?: number;
  defaultTrialDays?: number;
  requirePaymentMethodForPaidPlans?: boolean;
};

type NormalizedBillingRevenueTier = {
  id?: string;
  minRevenue: Prisma.Decimal;
  maxRevenue: Prisma.Decimal | null;
  price: Prisma.Decimal;
  label: string | null;
  sortOrder: number;
};

const ZERO = new Prisma.Decimal(0);

@Controller('admin/billing')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly billingUsageService: BillingUsageService,
    private readonly billingCycleService: BillingCycleService,
    private readonly prisma: PrismaService,
    private readonly billingSettingsService: BillingSettingsService,
    private readonly billingPaymentAttemptService: BillingPaymentAttemptService,
    private readonly billingPaymentGatewayService: BillingPaymentGatewayService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
    private readonly revenueLedgerService: RevenueLedgerService,
    private readonly billingAddonService: BillingAddonService,
  ) {}

  @Get('plans')
  @RequireAdminPermissions('saas.plans.read')
  async listPlans() {
    return this.billingService.listPlans(true);
  }

  @Post('plans')
  @RequireAdminPermissions('saas.plans.manage')
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.billingService.createPlan(dto);
  }

  @Put('plans/:id')
  @RequireAdminPermissions('saas.plans.manage')
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.billingService.updatePlan(id, dto);
  }

  @Get('plans-v2')
  @RequireAdminPermissions('saas.billing.read')
  async listBillingPlansV2() {
    const plans = await this.prisma.billingPlan.findMany({
      include: {
        revenueTiers: {
          orderBy: [{ sortOrder: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    return plans.map((plan) => ({
      ...plan,
      revenueTiers: plan.revenueTiers.map((tier) => ({
        ...tier,
        label: normalizeSeededRevenueTierLabel(tier),
      })),
    }));
  }

  @Put('plans-v2/:id')
  @RequireAdminPermissions('saas.billing.manage')
  async updateBillingPlanV2(@Param('id') id: string, @Body() body: UpdateBillingPlanV2Body) {
    const existing = await this.prisma.billingPlan.findUnique({
      where: { id },
      include: { revenueTiers: true },
    });
    if (!existing) {
      throw new NotFoundException('Plano de billing não encontrado.');
    }

    const tiers = body.tiers ? this.normalizeRevenueTiers(body.tiers) : null;
    if (tiers) {
      const existingTierIds = new Set(existing.revenueTiers.map((tier) => tier.id));
      const invalidTier = tiers.find((tier) => tier.id && !existingTierIds.has(tier.id));
      if (invalidTier) {
        throw new BadRequestException('Uma das faixas informadas não pertence ao plano.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.billingPlan.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: this.parseOptionalString(body.name, 'name', 100) } : {}),
          ...(body.description !== undefined ? { description: this.parseNullableString(body.description, 'description', 255) } : {}),
          ...(body.trialDays !== undefined ? { trialDays: this.parseIntegerRange(body.trialDays, 'trialDays', 0, 365) } : {}),
          ...(body.requiresPaymentMethod !== undefined ? { requiresPaymentMethod: this.requireBoolean(body.requiresPaymentMethod, 'requiresPaymentMethod') } : {}),
          ...(body.allowAllModules !== undefined ? { allowAllModules: this.requireBoolean(body.allowAllModules, 'allowAllModules') } : {}),
          ...(body.isActive !== undefined ? { isActive: this.requireBoolean(body.isActive, 'isActive') } : {}),
          ...(body.isPublic !== undefined ? { isPublic: this.requireBoolean(body.isPublic, 'isPublic') } : {}),
        },
      });

      if (tiers) {
        const incomingIds = tiers.map((tier) => tier.id).filter((tierId): tierId is string => Boolean(tierId));
        await tx.billingRevenueTier.deleteMany({
          where: {
            planId: id,
            ...(incomingIds.length ? { id: { notIn: incomingIds } } : {}),
          },
        });

        for (const tier of tiers) {
          if (tier.id) {
            await tx.billingRevenueTier.update({
              where: { id: tier.id },
              data: { sortOrder: 10000 + tier.sortOrder },
            });
          }
        }

        for (const tier of tiers) {
          const data = {
            minRevenue: tier.minRevenue,
            maxRevenue: tier.maxRevenue,
            price: tier.price,
            label: tier.label,
            sortOrder: tier.sortOrder,
          };
          if (tier.id) {
            await tx.billingRevenueTier.update({
              where: { id: tier.id },
              data,
            });
          } else {
            await tx.billingRevenueTier.create({
              data: {
                planId: id,
                ...data,
              },
            });
          }
        }
      }

      return tx.billingPlan.findUniqueOrThrow({
        where: { id },
        include: {
          revenueTiers: {
            orderBy: [{ sortOrder: 'asc' }],
          },
        },
      });
    });
  }

  @Get('overview')
  @RequireAdminPermissions('saas.billing.read')
  async getBillingOverview() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

    const [
      totalTenants,
      tenantsWithBilling,
      trialingSubscriptions,
      activeSubscriptions,
      draftInvoices,
      openCycles,
      closedCycles,
      monthUsage,
      estimatedSaasRevenue,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenantBillingSubscription.groupBy({
        by: ['tenantId'],
        _count: { tenantId: true },
      }),
      this.prisma.tenantBillingSubscription.count({ where: { status: 'trialing' } }),
      this.prisma.tenantBillingSubscription.count({ where: { status: 'active' } }),
      this.prisma.invoice.count({ where: { status: 'draft' } }),
      this.prisma.billingCycleRecord.count({ where: { status: 'open' } }),
      this.prisma.billingCycleRecord.count({ where: { status: 'closed' } }),
      this.prisma.billingUsageSnapshot.aggregate({
        where: {
          periodStart: { gte: monthStart },
          periodEnd: { lte: monthEnd },
        },
        _sum: { billableAmount: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          status: 'draft',
          createdAt: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
        _sum: { total: true },
      }),
    ]);

    return {
      totalTenants,
      tenantsWithBilling: tenantsWithBilling.length,
      tenantsWithoutNewBilling: Math.max(0, totalTenants - tenantsWithBilling.length),
      draftInvoices,
      openCycles,
      closedCycles,
      monthBillableRevenue: monthUsage._sum.billableAmount ?? 0,
      estimatedSaasRevenue: estimatedSaasRevenue._sum.total ?? 0,
      trialingSubscriptions,
      activeSubscriptions,
      monthStart,
      monthEnd,
    };
  }

  @Get('settings')
  @RequireAdminPermissions('saas.billing.read')
  async getBillingSettings() {
    const settings = await this.billingSettingsService.ensureDefaultSettings();
    const [plan, addon] = await Promise.all([
      this.tenantBillingResolver.getDefaultBillingPlan(),
      this.billingAddonService.ensureAiAddonDefinition(),
    ]);
    return this.buildBillingSettingsResponse(settings, plan, addon);
  }

  @Put('settings')
  @RequireAdminPermissions('saas.billing.manage')
  async updateBillingSettings(@Body() body: UpdateBillingSettingsBody) {
    const current = await this.billingSettingsService.ensureDefaultSettings();
    const plan = await this.tenantBillingResolver.getDefaultBillingPlan();

    const [updatedSettings] = await this.prisma.$transaction(async (tx) => {
      if (body.trialProDays !== undefined || body.trialRequiresPaymentMethod !== undefined || body.freeTierRevenueLimit !== undefined || body.maxMonthlyCharge !== undefined) {
        const planUpdate: Prisma.BillingPlanUpdateInput = {};
        if (body.trialProDays !== undefined) planUpdate.trialDays = this.parseIntegerRange(body.trialProDays, 'trialProDays', 0, 365);
        if (body.trialRequiresPaymentMethod !== undefined) planUpdate.requiresPaymentMethod = this.requireBoolean(body.trialRequiresPaymentMethod, 'trialRequiresPaymentMethod');

        if (body.freeTierRevenueLimit !== undefined || body.maxMonthlyCharge !== undefined) {
          const existingTiers = await tx.billingRevenueTier.findMany({
            where: { planId: plan.id },
            orderBy: [{ sortOrder: 'asc' }],
          });
          const freeTierLimit = body.freeTierRevenueLimit !== undefined
            ? this.parseDecimal(body.freeTierRevenueLimit, 'freeTierRevenueLimit')
            : new Prisma.Decimal(existingTiers[0]?.maxRevenue ?? 1500);
          const maxMonthlyCharge = body.maxMonthlyCharge !== undefined
            ? this.parseDecimal(body.maxMonthlyCharge, 'maxMonthlyCharge')
            : existingTiers.reduce((highest, tier) => new Prisma.Decimal(tier.price).gt(highest) ? new Prisma.Decimal(tier.price) : highest, ZERO);
          if (existingTiers.length >= 4) {
            await tx.billingRevenueTier.update({ where: { id: existingTiers[0].id }, data: { maxRevenue: freeTierLimit, price: ZERO } });
            await tx.billingRevenueTier.update({ where: { id: existingTiers[1].id }, data: { minRevenue: freeTierLimit.plus(0.01) } });
            const topTier = existingTiers[existingTiers.length - 1];
            await tx.billingRevenueTier.update({ where: { id: topTier.id }, data: { price: maxMonthlyCharge } });
          }
        }

        if (Object.keys(planUpdate).length) {
          await tx.billingPlan.update({ where: { id: plan.id }, data: planUpdate });
        }
      }

      if (body.aiAddonEnabled !== undefined || body.aiAddonPrice !== undefined) {
        const addon = await this.billingAddonService.ensureAiAddonDefinition(tx);
        await tx.billingModuleAddon.update({
          where: { id: addon.id },
          data: {
            ...(body.aiAddonEnabled !== undefined ? { isActive: this.requireBoolean(body.aiAddonEnabled, 'aiAddonEnabled') } : {}),
            ...(body.aiAddonPrice !== undefined ? { price: this.parseDecimal(body.aiAddonPrice, 'aiAddonPrice') } : {}),
          },
        });
      }

      const updated = await tx.billingSettings.update({
        where: { id: current.id },
        data: {
          ...(body.includeDeliveryFeeByDefault !== undefined ? { includeDeliveryFeeByDefault: this.requireBoolean(body.includeDeliveryFeeByDefault, 'includeDeliveryFeeByDefault') } : {}),
          ...(body.includeServiceFeeByDefault !== undefined ? { includeServiceFeeByDefault: this.requireBoolean(body.includeServiceFeeByDefault, 'includeServiceFeeByDefault') } : {}),
          ...(body.countStorefrontOrders !== undefined ? { countStorefrontOrders: this.requireBoolean(body.countStorefrontOrders, 'countStorefrontOrders') } : {}),
          ...(body.countDirectOnlineOrders !== undefined ? { countDirectOnlineOrders: this.requireBoolean(body.countDirectOnlineOrders, 'countDirectOnlineOrders') } : {}),
          ...(body.countPosOrders !== undefined ? { countPosOrders: this.requireBoolean(body.countPosOrders, 'countPosOrders') } : {}),
          ...(body.countWhatsappAiOrders !== undefined ? { countWhatsappAiOrders: this.requireBoolean(body.countWhatsappAiOrders, 'countWhatsappAiOrders') } : {}),
          ...(body.countManualOrders !== undefined ? { countManualOrders: this.requireBoolean(body.countManualOrders, 'countManualOrders') } : {}),
          ...(body.countMarketplaceIfoodOrders !== undefined ? { countMarketplaceIfoodOrders: this.requireBoolean(body.countMarketplaceIfoodOrders, 'countMarketplaceIfoodOrders') } : {}),
          ...(body.countMarketplaceOrdersDefault !== undefined ? { countMarketplaceIfoodOrders: this.requireBoolean(body.countMarketplaceOrdersDefault, 'countMarketplaceOrdersDefault') } : {}),
          ...(body.countMarketplaceRappiOrders !== undefined ? { countMarketplaceRappiOrders: this.requireBoolean(body.countMarketplaceRappiOrders, 'countMarketplaceRappiOrders') } : {}),
          ...(body.countMarketplaceUbereatsOrders !== undefined ? { countMarketplaceUbereatsOrders: this.requireBoolean(body.countMarketplaceUbereatsOrders, 'countMarketplaceUbereatsOrders') } : {}),
          ...(body.countMarketplace99foodOrders !== undefined ? { countMarketplace99foodOrders: this.requireBoolean(body.countMarketplace99foodOrders, 'countMarketplace99foodOrders') } : {}),
          ...(body.countMarketplaceKettaOrders !== undefined ? { countMarketplaceKettaOrders: this.requireBoolean(body.countMarketplaceKettaOrders, 'countMarketplaceKettaOrders') } : {}),
          ...(body.countMarketplaceZeDeliveryOrders !== undefined ? { countMarketplaceZeDeliveryOrders: this.requireBoolean(body.countMarketplaceZeDeliveryOrders, 'countMarketplaceZeDeliveryOrders') } : {}),
          ...(body.countConfirmedOrders !== undefined ? { countConfirmedOrders: this.requireBoolean(body.countConfirmedOrders, 'countConfirmedOrders') } : {}),
          ...(body.countCompletedOrders !== undefined ? { countCompletedOrders: this.requireBoolean(body.countCompletedOrders, 'countCompletedOrders') } : {}),
          ...(body.excludeCancelledOrders !== undefined ? { excludeCancelledOrders: this.requireBoolean(body.excludeCancelledOrders, 'excludeCancelledOrders') } : {}),
          ...(body.discountReducesRevenue !== undefined ? { discountReducesRevenue: this.requireBoolean(body.discountReducesRevenue, 'discountReducesRevenue') } : {}),
          ...(body.defaultGracePeriodDays !== undefined ? { defaultGracePeriodDays: this.parseIntegerRange(body.defaultGracePeriodDays, 'defaultGracePeriodDays', 0, 365) } : {}),
          ...(body.defaultTrialDays !== undefined ? { defaultTrialDays: this.parseIntegerRange(body.defaultTrialDays, 'defaultTrialDays', 0, 365) } : {}),
          ...(body.requirePaymentMethodForPaidPlans !== undefined ? { requirePaymentMethodForPaidPlans: this.requireBoolean(body.requirePaymentMethodForPaidPlans, 'requirePaymentMethodForPaidPlans') } : {}),
          ...(body.trialProEnabled !== undefined ? { trialProEnabled: this.requireBoolean(body.trialProEnabled, 'trialProEnabled') } : {}),
          ...(body.trialIncludesAi !== undefined ? { trialIncludesAi: this.requireBoolean(body.trialIncludesAi, 'trialIncludesAi') } : {}),
          ...(body.trialIncludesIfood !== undefined ? { trialIncludesIfood: this.requireBoolean(body.trialIncludesIfood, 'trialIncludesIfood') } : {}),
          ...(body.trialIncludesAdvancedReports !== undefined ? { trialIncludesAdvancedReports: this.requireBoolean(body.trialIncludesAdvancedReports, 'trialIncludesAdvancedReports') } : {}),
          ...(body.trialAutoConvertToBilling !== undefined ? { trialAutoConvertToBilling: this.requireBoolean(body.trialAutoConvertToBilling, 'trialAutoConvertToBilling') } : {}),
          ...(body.aiIncludedForPaidTenants !== undefined ? { aiIncludedForPaidTenants: this.requireBoolean(body.aiIncludedForPaidTenants, 'aiIncludedForPaidTenants') } : {}),
          ...(body.aiIncludedMonthlyMessages !== undefined ? { aiIncludedMonthlyMessages: this.parseIntegerRange(body.aiIncludedMonthlyMessages, 'aiIncludedMonthlyMessages', 0, 1000000) } : {}),
          ...(body.aiFreeTrialMessages !== undefined ? { aiFreeTrialMessages: this.parseIntegerRange(body.aiFreeTrialMessages, 'aiFreeTrialMessages', 0, 1000000) } : {}),
          ...(body.aiHardLimitMonthlyMessages !== undefined ? { aiHardLimitMonthlyMessages: this.parseIntegerRange(body.aiHardLimitMonthlyMessages, 'aiHardLimitMonthlyMessages', 1, 1000000) } : {}),
          ...(body.partnerLinksJson !== undefined ? { partnerLinksJson: body.partnerLinksJson } : {}),
        },
      });

      return [updated];
    });

    const [nextPlan, nextAddon] = await Promise.all([
      this.tenantBillingResolver.getDefaultBillingPlan(),
      this.billingAddonService.ensureAiAddonDefinition(),
    ]);

    return this.buildBillingSettingsResponse(updatedSettings, nextPlan, nextAddon);
  }

  @Get('payment-config')
  @RequireAdminPermissions('saas.billing.read')
  getBillingPaymentConfig() {
    return this.billingPaymentGatewayService.getRuntimeConfig();
  }

  @Get('tenants/:tenantId/subscription')
  @RequireAdminPermissions('saas.billing.read')
  async getTenantBillingSubscription(@Param('tenantId') tenantId: string) {
    const billingState = await this.tenantBillingResolver.getTenantBillingState(tenantId);
    const subscription = await this.prisma.tenantBillingSubscription.findFirst({
      where: { tenantId },
      include: {
        tenant: true,
        billingPlan: {
          include: {
            revenueTiers: {
              orderBy: [{ sortOrder: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const [currentCycle, latestInvoice] = await Promise.all([
      this.prisma.billingCycleRecord.findFirst({
        where: subscription
          ? { tenantId, subscriptionId: subscription.id }
          : { tenantId },
        orderBy: [{ startedAt: 'desc' }],
      }),
      this.prisma.invoice.findFirst({
        where: subscription
          ? { tenantId, subscriptionId: subscription.id }
          : { tenantId },
        include: { items: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
    ]);

    return {
      subscription,
      plan: subscription?.billingPlan ?? null,
      tenant: subscription?.tenant ?? null,
      currentCycle,
      latestInvoice,
      calculatedStatus: this.calculateSubscriptionStatus(subscription),
      billingState,
    };
  }

  @Post('tenants/:tenantId/subscription')
  @RequireAdminPermissions('saas.billing.manage')
  async createTenantBillingSubscription(
    @Param('tenantId') tenantId: string,
    @Body() body: { billingPlanId?: string },
  ) {
    await this.tenantBillingResolver.getOrCreateTenantBillingSubscription(tenantId, body.billingPlanId);
    return this.getTenantBillingSubscription(tenantId);
  }

  @Get('tenants/:tenantId/cycles')
  @RequireAdminPermissions('saas.billing.read')
  async listTenantBillingCycles(@Param('tenantId') tenantId: string) {
    return this.prisma.billingCycleRecord.findMany({
      where: { tenantId },
      include: {
        selectedTier: true,
        usageSnapshots: {
          orderBy: [{ createdAt: 'desc' }],
        },
        invoices: {
          include: { items: true },
          orderBy: [{ createdAt: 'desc' }],
        },
      },
      orderBy: [{ startedAt: 'desc' }],
    });
  }

  @Get('tenants/:tenantId/invoices')
  @RequireAdminPermissions('saas.billing.read')
  async listTenantBillingInvoices(@Param('tenantId') tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { tenantId },
      include: {
        tenant: true,
        subscription: {
          include: { billingPlan: true },
        },
        cycle: true,
        items: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  @Get('invoices')
  @RequireAdminPermissions('saas.billing.read')
  async listBillingInvoices(@Query('status') status?: string) {
    return this.prisma.invoice.findMany({
      where: status?.trim() ? { status: this.parseInvoiceStatus(status) } : {},
      include: {
        tenant: true,
        subscription: {
          include: { billingPlan: true },
        },
        cycle: true,
        items: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
  }

  @Get('invoices/:invoiceId/payment-attempts')
  @RequireAdminPermissions('saas.billing.read')
  async listInvoicePaymentAttempts(@Param('invoiceId') invoiceId: string) {
    return this.billingPaymentAttemptService.listAttemptsForInvoice(invoiceId);
  }

  @Post('invoices/:invoiceId/payment-attempts')
  @RequireAdminPermissions('saas.billing.manage')
  async createInvoicePaymentAttempt(
    @Param('invoiceId') invoiceId: string,
    @Body() body: {
      tenantId?: string;
      provider?: string;
      mode?: string;
      idempotencyKey?: string;
      simulate?: string;
    },
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice não encontrada.');
    }

    return this.billingPaymentAttemptService.createAttemptForInvoice({
      invoiceId,
      tenantId: body.tenantId?.trim() || invoice.tenantId,
      provider: this.parsePaymentProvider(body.provider),
      mode: this.parseBillingGatewayMode(body.mode),
      idempotencyKey: body.idempotencyKey,
      simulate: this.parsePaymentSimulation(body.simulate),
    });
  }

  @Post('payment-attempts/:attemptId/mark-paid')
  @RequireAdminPermissions('saas.billing.manage')
  async markPaymentAttemptPaid(
    @Param('attemptId') attemptId: string,
    @Body() body: { reason?: string },
  ) {
    return this.billingPaymentAttemptService.markAttemptSucceeded({
      attemptId,
      reason: body.reason,
    });
  }

  @Post('payment-attempts/:attemptId/mark-failed')
  @RequireAdminPermissions('saas.billing.manage')
  async markPaymentAttemptFailed(
    @Param('attemptId') attemptId: string,
    @Body() body: { errorCode?: string; errorMessage?: string },
  ) {
    return this.billingPaymentAttemptService.markAttemptFailed({
      attemptId,
      errorCode: body.errorCode,
      errorMessage: body.errorMessage,
    });
  }

  @Post('mock-webhooks/payment-status')
  @RequireAdminPermissions('saas.billing.manage')
  async applyMockPaymentWebhook(
    @Body() body: {
      eventId?: string;
      providerPaymentId?: string;
      status?: string;
    },
  ) {
    const eventId = this.requireString(body.eventId, 'eventId');
    const providerPaymentId = this.requireString(body.providerPaymentId, 'providerPaymentId');
    const status = this.parseMockWebhookStatus(body.status);

    return this.billingPaymentAttemptService.applyMockPaymentStatusWebhook({
      eventId,
      providerPaymentId,
      status,
    });
  }

  @Get('audit/revenue-events')
  @RequireAdminPermissions('saas.billing.audit')
  async listRevenueEvents(
    @Query('tenantId') tenantId: string,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ) {
    const parsedTenantId = this.requireString(tenantId, 'tenantId');
    return this.revenueLedgerService.listEvents({
      tenantId: parsedTenantId,
      periodStart: this.parseOptionalDate(periodStart, 'periodStart'),
      periodEnd: this.parseOptionalDate(periodEnd, 'periodEnd'),
      take: 200,
    });
  }

  @Get('audit/snapshots')
  @RequireAdminPermissions('saas.billing.audit')
  async listUsageSnapshots(@Query('tenantId') tenantId: string) {
    const parsedTenantId = this.requireString(tenantId, 'tenantId');
    return this.prisma.billingUsageSnapshot.findMany({
      where: { tenantId: parsedTenantId },
      include: {
        billingRuleVersion: true,
        cycle: true,
        invoices: {
          select: {
            id: true,
            number: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  @Get('audit/subscription-history')
  @RequireAdminPermissions('saas.billing.audit')
  async listSubscriptionStatusHistory(@Query('tenantId') tenantId: string) {
    const parsedTenantId = this.requireString(tenantId, 'tenantId');
    return this.prisma.subscriptionStatusHistory.findMany({
      where: { tenantId: parsedTenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
  }

  @Get('invoices/:invoiceId')
  @RequireAdminPermissions('saas.billing.read')
  async getInvoiceDetails(@Param('invoiceId') invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        tenant: true,
        items: true,
        paymentAttempts: {
          orderBy: [{ attemptedAt: 'desc' }, { createdAt: 'desc' }],
        },
        usageSnapshot: {
          include: {
            billingRuleVersion: true,
          },
        },
        billingRuleVersion: true,
        cycle: {
          include: {
            selectedTier: true,
            usageSnapshots: {
              orderBy: [{ createdAt: 'desc' }],
              take: 1,
            },
          },
        },
        subscription: {
          include: {
            billingPlan: {
              include: {
                revenueTiers: {
                  orderBy: [{ sortOrder: 'asc' }],
                },
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice não encontrada.');
    }

    return {
      invoice,
      items: invoice.items,
      paymentAttempts: invoice.paymentAttempts,
      cycle: invoice.cycle,
      snapshot: invoice.usageSnapshot ?? invoice.cycle?.usageSnapshots[0] ?? null,
      subscription: invoice.subscription,
      plan: invoice.subscription.billingPlan,
      tier: invoice.cycle?.selectedTier ?? null,
    };
  }

  @Get('usage-preview')
  @RequireAdminPermissions('saas.billing.read')
  async getUsagePreview(
    @Query('tenantId') tenantId?: string,
    @Query('periodStart') periodStartRaw?: string,
    @Query('periodEnd') periodEndRaw?: string,
    @Query('planId') planId?: string,
  ) {
    const periodStart = this.parseRequiredDate(periodStartRaw, 'periodStart');
    const periodEnd = this.parseRequiredDate(periodEndRaw, 'periodEnd');

    if (!tenantId?.trim()) {
      throw new BadRequestException('tenantId é obrigatório.');
    }

    return this.billingUsageService.getBillableRevenuePreview({
      tenantId,
      periodStart,
      periodEnd,
      planId,
    });
  }

  @Post('tenants/:tenantId/trial-pro/activate')
  @RequireAdminPermissions('saas.billing.manage')
  async activateTrialProAssisted(@Param('tenantId') tenantId: string) {
    const settings = await this.billingSettingsService.ensureDefaultSettings();
    if (!settings.trialProEnabled) {
      throw new BadRequestException('Trial Pro desativado no SaaS Admin.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    const plan = await this.tenantBillingResolver.getDefaultBillingPlan();
    const subscription = await this.tenantBillingResolver.getOrCreateTenantBillingSubscription(tenantId, plan.id);
    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + Math.max(0, plan.trialDays));

    await this.prisma.tenantBillingSubscription.update({
      where: { id: subscription.id },
      data: {
        status: 'trialing',
        trialStartedAt: now,
        trialEndsAt,
        requiresPaymentMethod: false,
      },
    });

    return {
      tenantId,
      activationMode: 'assisted_admin',
      trialEndsAt,
      autoConvertEnabled: settings.trialAutoConvertToBilling,
      state: await this.tenantBillingResolver.getTenantBillingState(tenantId),
    };
  }

  @Post('usage-snapshots')
  @RequireAdminPermissions('saas.billing.manage')
  async createUsageSnapshot(
    @Body() body: {
      tenantId?: string;
      cycleId?: string;
      periodStart?: string;
      periodEnd?: string;
      planId?: string;
    },
  ) {
    const periodStart = this.parseRequiredDate(body.periodStart, 'periodStart');
    const periodEnd = this.parseRequiredDate(body.periodEnd, 'periodEnd');

    if (!body.tenantId?.trim()) {
      throw new BadRequestException('tenantId é obrigatório.');
    }

    return this.billingUsageService.createUsageSnapshot({
      tenantId: body.tenantId,
      cycleId: body.cycleId,
      periodStart,
      periodEnd,
      planId: body.planId,
    });
  }

  @Post('cycles/current')
  @RequireAdminPermissions('saas.billing.manage')
  async getOrCreateCurrentCycle(
    @Body() body: {
      tenantId?: string;
      subscriptionId?: string;
      now?: string;
    },
  ) {
    const tenantId = this.requireString(body.tenantId, 'tenantId');
    const subscriptionId = this.requireString(body.subscriptionId, 'subscriptionId');
    const now = body.now ? this.parseRequiredDate(body.now, 'now') : undefined;

    return this.billingCycleService.getOrCreateCurrentCycle({
      tenantId,
      subscriptionId,
      now,
    });
  }

  @Get('cycles/:cycleId/preview-invoice')
  @RequireAdminPermissions('saas.billing.read')
  async previewCycleInvoice(
    @Param('cycleId') cycleId: string,
    @Query('tenantId') tenantIdRaw?: string,
    @Query('subscriptionId') subscriptionIdRaw?: string,
    @Query('planId') planIdRaw?: string,
  ) {
    const tenantId = this.requireString(tenantIdRaw, 'tenantId');
    const subscriptionId = this.requireString(subscriptionIdRaw, 'subscriptionId');
    const planId = this.requireString(planIdRaw, 'planId');

    return this.billingCycleService.previewCycleInvoice({
      tenantId,
      subscriptionId,
      cycleId,
      planId,
    });
  }

  @Post('cycles/:cycleId/close-and-draft-invoice')
  @RequireAdminPermissions('saas.billing.manage')
  async closeCycleAndCreateDraftInvoice(
    @Param('cycleId') cycleId: string,
    @Body() body: {
      tenantId?: string;
      subscriptionId?: string;
      planId?: string;
    },
  ) {
    const tenantId = this.requireString(body.tenantId, 'tenantId');
    const subscriptionId = this.requireString(body.subscriptionId, 'subscriptionId');
    const planId = this.requireString(body.planId, 'planId');

    return this.billingCycleService.closeCycleAndCreateDraftInvoice({
      tenantId,
      subscriptionId,
      cycleId,
      planId,
    });
  }

  private normalizeRevenueTiers(tiers: BillingRevenueTierInput[]): NormalizedBillingRevenueTier[] {
    if (!tiers.length) {
      throw new BadRequestException('O plano precisa ter pelo menos uma faixa de faturamento.');
    }

    const normalized = tiers.map((tier, index) => {
      const minRevenue = this.parseDecimal(tier.minRevenue, `tiers.${index}.minRevenue`);
      const maxRevenue = tier.maxRevenue === null || tier.maxRevenue === undefined || tier.maxRevenue === ''
        ? null
        : this.parseDecimal(tier.maxRevenue, `tiers.${index}.maxRevenue`);
      const price = this.parseDecimal(tier.price, `tiers.${index}.price`);

      if (minRevenue.isNegative()) {
        throw new BadRequestException(`tiers.${index}.minRevenue não pode ser negativo.`);
      }
      if (price.isNegative()) {
        throw new BadRequestException(`tiers.${index}.price não pode ser negativo.`);
      }
      if (maxRevenue && maxRevenue.lt(minRevenue)) {
        throw new BadRequestException(`tiers.${index}.maxRevenue deve ser maior ou igual ao minRevenue.`);
      }

      return {
        ...(tier.id?.trim() ? { id: tier.id.trim() } : {}),
        minRevenue,
        maxRevenue,
        price,
        label: normalizeSeededRevenueTierLabel({
          label: this.parseNullableString(tier.label ?? null, `tiers.${index}.label`, 100),
          minRevenue,
          maxRevenue,
        }),
        sortOrder: index,
      };
    });

    const sorted = [...normalized].sort((left, right) => left.minRevenue.cmp(right.minRevenue));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (!previous.maxRevenue) {
        throw new BadRequestException('Somente a última faixa pode ficar sem maxRevenue.');
      }
      if (current.minRevenue.lte(previous.maxRevenue)) {
        throw new BadRequestException('As faixas de faturamento não podem se sobrepor.');
      }
    }

    return normalized;
  }

  private parseDecimal(value: string | number | undefined, field: string): Prisma.Decimal {
    if (value === undefined || value === null || value === '') {
      throw new BadRequestException(`${field} é obrigatório.`);
    }
    const normalized = typeof value === 'number'
      ? String(value)
      : value.trim().replace(',', '.');
    try {
      const decimal = new Prisma.Decimal(normalized);
      if (!decimal.isFinite()) {
        throw new Error('not finite');
      }
      return decimal.toDecimalPlaces(2);
    } catch {
      throw new BadRequestException(`${field} deve ser um número válido.`);
    }
  }

  private parseIntegerRange(value: number, field: string, min: number, max: number): number {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new BadRequestException(`${field} deve ser um inteiro entre ${min} e ${max}.`);
    }
    return value;
  }

  private requireBoolean(value: boolean, field: string): boolean {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} deve ser booleano.`);
    }
    return value;
  }

  private parseOptionalString(value: string, field: string, maxLength: number): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} é obrigatório.`);
    }
    if (value.trim().length > maxLength) {
      throw new BadRequestException(`${field} deve ter no máximo ${maxLength} caracteres.`);
    }
    return value.trim();
  }

  private parseNullableString(value: string | null | undefined, field: string, maxLength: number): string | null {
    if (value === null || value === undefined || value.trim() === '') return null;
    if (value.length > maxLength) {
      throw new BadRequestException(`${field} deve ter no máximo ${maxLength} caracteres.`);
    }
    return value.trim();
  }

  private parseRequiredDate(value: string | undefined, field: string): Date {
    if (!value) {
      throw new BadRequestException(`${field} é obrigatório.`);
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} deve ser uma data válida.`);
    }

    return date;
  }

  private parseOptionalDate(value: string | undefined, field: string): Date | undefined {
    if (!value?.trim()) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} deve ser uma data valida.`);
    }
    return date;
  }

  private requireString(value: string | undefined, field: string): string {
    if (!value?.trim()) {
      throw new BadRequestException(`${field} é obrigatório.`);
    }
    return value;
  }

  private parseInvoiceStatus(status: string) {
    const normalized = status.trim();
    const allowed = ['draft', 'open', 'paid', 'failed', 'void', 'overdue'] as const;
    if (!allowed.includes(normalized as typeof allowed[number])) {
      throw new BadRequestException('status de invoice inválido.');
    }
    return normalized as typeof allowed[number];
  }

  private parsePaymentProvider(provider: string | undefined): PaymentProvider {
    const normalized = provider?.trim();
    if (normalized === PaymentProvider.manual) return PaymentProvider.manual;
    if (normalized === PaymentProvider.mock) return PaymentProvider.mock;
    if (normalized === PaymentProvider.asaas) return PaymentProvider.asaas;
    throw new BadRequestException('provider deve ser manual, mock ou asaas nesta fase.');
  }

  private parseBillingGatewayMode(mode: string | undefined): BillingGatewayMode {
    const normalized = mode?.trim();
    if (normalized === BillingGatewayMode.manual) return BillingGatewayMode.manual;
    if (normalized === BillingGatewayMode.sandbox) return BillingGatewayMode.sandbox;
    if (normalized === BillingGatewayMode.production) return BillingGatewayMode.production;
    throw new BadRequestException('mode deve ser manual, sandbox ou production.');
  }

  private parsePaymentSimulation(simulate: string | undefined): 'success' | 'failure' | 'pending' | undefined {
    if (!simulate?.trim()) return undefined;
    const normalized = simulate.trim();
    if (normalized === 'success' || normalized === 'failure' || normalized === 'pending') {
      return normalized;
    }
    throw new BadRequestException('simulate deve ser success, failure ou pending.');
  }

  private parseMockWebhookStatus(status: string | undefined): 'succeeded' | 'failed' | 'pending' {
    const normalized = status?.trim();
    if (normalized === 'succeeded' || normalized === 'failed' || normalized === 'pending') {
      return normalized;
    }
    throw new BadRequestException('status deve ser succeeded, failed ou pending.');
  }

  private calculateSubscriptionStatus(
    subscription: { status: string; trialEndsAt: Date | null; gracePeriodEndsAt: Date | null } | null,
  ): string {
    if (!subscription) return 'missing_new_billing_subscription';
    const now = new Date();
    if (subscription.status === 'trialing' && subscription.trialEndsAt && subscription.trialEndsAt < now) {
      return 'trial_expired_not_enforced';
    }
    if (subscription.status === 'grace_period' && subscription.gracePeriodEndsAt && subscription.gracePeriodEndsAt < now) {
      return 'grace_period_expired_not_enforced';
    }
    return subscription.status;
  }

  private buildBillingSettingsResponse(
    settings: Awaited<ReturnType<BillingSettingsService['ensureDefaultSettings']>>,
    plan: Awaited<ReturnType<TenantBillingResolverService['getDefaultBillingPlan']>>,
    addon: Awaited<ReturnType<BillingAddonService['ensureAiAddonDefinition']>>,
  ) {
    const freeTier = [...plan.revenueTiers]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .find((tier) => new Prisma.Decimal(tier.price).eq(ZERO));
    const maxMonthlyCharge = plan.revenueTiers.reduce(
      (highest, tier) => new Prisma.Decimal(tier.price).gt(highest) ? new Prisma.Decimal(tier.price) : highest,
      ZERO,
    );

    return {
      ...settings,
      freeTierRevenueLimit: freeTier?.maxRevenue ?? 0,
      maxMonthlyCharge,
      trialProDays: plan.trialDays,
      trialRequiresPaymentMethod: plan.requiresPaymentMethod,
      aiAddonEnabled: addon.isActive,
      aiAddonPrice: addon.price,
      countMarketplaceOrdersDefault: settings.countMarketplaceIfoodOrders,
    };
  }
}

