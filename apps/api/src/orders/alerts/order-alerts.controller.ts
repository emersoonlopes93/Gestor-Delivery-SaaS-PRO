import { Controller, Get, Patch, Param, Query, Request, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators';
import { OrderAlertState } from '@prisma/client';
import { OrderAlertsService } from './order-alerts.service';

type TenantRequest = ExpressRequest & { user: TenantJwtPayload };

@Controller('order-alerts')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class OrderAlertsController {
  constructor(private readonly alerts: OrderAlertsService) {}

  @Get()
  @RequirePermissions('orders.use_kanban')
  async list(@Request() req: TenantRequest, @Query('state') state?: OrderAlertState) {
    await this.alerts.refreshTenant(req.user.tenantId);
    return this.alerts.list(req.user.tenantId, state);
  }

  @Patch(':id/acknowledge')
  @RequirePermissions('orders.use_kanban')
  acknowledge(@Request() req: TenantRequest, @Param('id') id: string) {
    return this.alerts.acknowledge(req.user.tenantId, id, req.user.sub);
  }
}
