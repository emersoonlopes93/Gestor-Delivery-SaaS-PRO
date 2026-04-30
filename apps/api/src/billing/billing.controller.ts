import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { RequirePermissions, CurrentTenant } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { BillingService } from './billing.service';
import type { CreatePlanDto, UpdatePlanDto, CreateSubscriptionDto, UpdateSubscriptionDto } from './dto/create-plan.dto';

@Controller('billing')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  async listPlans() {
    // Todos os usuários autenticados do tenant podem ver os planos (necessário para onboarding)
    return this.billingService.listPlans(true);
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
    return this.billingService.getCurrentSubscription(tenantId);
  }

  @Post('subscription')
  async createSubscription(
    @Body() dto: Omit<CreateSubscriptionDto, 'tenantId'>,
    @CurrentTenant() tenantId: string,
  ) {
    return this.billingService.createSubscription({ ...dto, tenantId });
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
    return this.billingService.checkAccess(tenantId);
  }
}
