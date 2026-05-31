import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RequireAdminPermissions } from '../../common/decorators';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { BillingService } from '../../billing/billing.service';
import { CreatePlanDto, UpdatePlanDto } from '../../billing/dto/create-plan.dto';
import { BillingUsageService } from '../../billing/billing-usage.service';
import { BillingCycleService } from '../../billing/billing-cycle.service';

@Controller('admin/billing')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly billingUsageService: BillingUsageService,
    private readonly billingCycleService: BillingCycleService,
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
}
