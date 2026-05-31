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

@Controller('admin/billing')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly billingUsageService: BillingUsageService,
    private readonly billingCycleService: BillingCycleService,
    private readonly prisma: PrismaService,
    private readonly billingSettingsService: BillingSettingsService,
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
    return this.prisma.billingPlan.findMany({
      include: {
        revenueTiers: {
          orderBy: [{ sortOrder: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'asc' }],
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
    return this.billingSettingsService.ensureDefaultSettings();
  }

  @Get('tenants/:tenantId/subscription')
  @RequireAdminPermissions('saas.billing.read')
  async getTenantBillingSubscription(@Param('tenantId') tenantId: string) {
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
    };
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

  @Get('invoices/:invoiceId')
  @RequireAdminPermissions('saas.billing.read')
  async getInvoiceDetails(@Param('invoiceId') invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        tenant: true,
        items: true,
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
      cycle: invoice.cycle,
      snapshot: invoice.cycle?.usageSnapshots[0] ?? null,
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
}
