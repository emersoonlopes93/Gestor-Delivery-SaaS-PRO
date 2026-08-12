import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import {
  CreateDeliveryRunDTO,
  type DriverDeliveryEvent,
  type DriverRouteEvent,
  ReorderDeliveryStopsDTO,
  UpdateDeliveryRunSettingsDTO,
} from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../common/decorators';
import { AuthenticatedRequest } from '../common/interfaces/request.interface';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { PushService } from '../notifications/push.service';
import { DeliveryRunsService } from './delivery-runs.service';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';

@Controller('delivery/runs')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DeliveryRunsController {
  constructor(
    private readonly deliveryRunsService: DeliveryRunsService,
    private readonly deliveryTrackingGateway: DeliveryTrackingGateway,
    private readonly pushService: PushService,
  ) {}

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

  @Get('order/:orderId')
  @RequirePermissions('delivery.read', 'delivery.dispatch')
  getRunForOrder(
    @Request() req: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.deliveryRunsService.getRunForTenantOrder(req.user.tenantId, orderId);
  }

  @Get(':id/locations')
  @RequirePermissions('delivery.read', 'delivery.dispatch')
  getLocationHistory(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.deliveryRunsService.getLocationHistory(req.user.tenantId, id);
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
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateDeliveryRunDTO,
  ) {
    const run = await this.deliveryRunsService.createAssignedRun(
      req.user.tenantId,
      dto.driverId,
      dto.orderIds,
      req.user.id,
    );
    const occurredAt = new Date().toISOString();
    const routeEvent: DriverRouteEvent = {
      eventId: `delivery.run_assigned:${run.id}:${occurredAt}`,
      type: 'delivery.run_assigned',
      change: 'assigned',
      runId: run.id,
      occurredAt,
    };
    this.deliveryTrackingGateway.emitDriverRouteEvent(
      req.user.tenantId,
      run.driverId,
      routeEvent,
    );

    const firstStop = run.stops[0];
    if (firstStop) {
      const legacyEvent: DriverDeliveryEvent = {
        eventId: `delivery.assigned:${firstStop.orderId}:${occurredAt}`,
        type: 'delivery.assigned',
        orderId: firstStop.orderId,
        orderNumber: firstStop.orderNumber,
        status: 'ready_for_delivery',
        occurredAt,
      };
      this.deliveryTrackingGateway.emitDriverDeliveryEvent(
        req.user.tenantId,
        run.driverId,
        legacyEvent,
      );
      await this.pushService.enqueueDriverNotification(req.user.tenantId, run.driverId, {
        title: 'Nova rota atribuída',
        body: `Você recebeu uma rota com ${run.stops.length} entrega(s).`,
        tag: `delivery-run-${run.id}`,
        url: '/',
        data: { ...legacyEvent, url: '/' },
      });
    }
    return run;
  }

  @Patch(':id/reorder')
  @RequirePermissions('delivery.dispatch')
  async reorder(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ReorderDeliveryStopsDTO,
  ) {
    const run = await this.deliveryRunsService.reorderTenantStops(
      req.user.tenantId,
      id,
      dto.stopIds,
      dto.expectedVersion,
      req.user.id,
    );
    const occurredAt = new Date().toISOString();
    const event: DriverRouteEvent = {
      eventId: `delivery.run_updated:${run.id}:reordered:${occurredAt}`,
      type: 'delivery.run_updated',
      change: 'reordered',
      runId: run.id,
      occurredAt,
    };
    this.deliveryTrackingGateway.emitDriverRouteEvent(
      req.user.tenantId,
      run.driverId,
      event,
    );
    return run;
  }
}
