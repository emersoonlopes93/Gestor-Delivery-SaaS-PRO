import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { RequireAdminPermissions } from '../../common/decorators';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { BillingService } from '../../billing/billing.service';
import { CreatePlanDto, UpdatePlanDto } from '../../billing/dto/create-plan.dto';

@Controller('admin/billing')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @RequireAdminPermissions('saas.billing.read')
  async listPlans() {
    return this.billingService.listPlans(true);
  }

  @Post('plans')
  @RequireAdminPermissions('saas.billing.write')
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.billingService.createPlan(dto);
  }

  @Put('plans/:id')
  @RequireAdminPermissions('saas.billing.write')
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.billingService.updatePlan(id, dto);
  }
}
