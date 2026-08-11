import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import {
  CreateDeliveryRunDTO,
  ReorderDeliveryStopsDTO,
  UpdateDeliveryRunSettingsDTO,
} from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../common/decorators';
import { AuthenticatedRequest } from '../common/interfaces/request.interface';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { DeliveryRunsService } from './delivery-runs.service';

@Controller('delivery/runs')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DeliveryRunsController {
  constructor(private readonly deliveryRunsService: DeliveryRunsService) {}

  @Get('builder')
  @RequirePermissions('delivery.read', 'delivery.dispatch')
  getBuilderData(@Request() req: AuthenticatedRequest) {
    return this.deliveryRunsService.getBuilderData(req.user.tenantId);
  }

  @Get('active')
  @RequirePermissions('delivery.read', 'delivery.dispatch')
  listActive(@Request() req: AuthenticatedRequest) {
    return this.deliveryRunsService.listActiveRuns(req.user.tenantId);
  }

  @Get('settings')
  @RequirePermissions('delivery.read', 'delivery.dispatch')
  getSettings(@Request() req: AuthenticatedRequest) {
    return this.deliveryRunsService.getSettings(req.user.tenantId);
  }

  @Patch('settings')
  @RequirePermissions('delivery.dispatch')
  updateSettings(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateDeliveryRunSettingsDTO,
  ) {
    return this.deliveryRunsService.updateSettings(
      req.user.tenantId,
      dto.requiresAcceptance,
      req.user.id,
    );
  }

  @Post()
  @RequirePermissions('delivery.dispatch')
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateDeliveryRunDTO,
  ) {
    return this.deliveryRunsService.createAssignedRun(
      req.user.tenantId,
      dto.driverId,
      dto.orderIds,
      req.user.id,
    );
  }

  @Patch(':id/reorder')
  @RequirePermissions('delivery.dispatch')
  reorder(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ReorderDeliveryStopsDTO,
  ) {
    return this.deliveryRunsService.reorderTenantStops(
      req.user.tenantId,
      id,
      dto.stopIds,
      dto.expectedVersion,
      req.user.id,
    );
  }
}
