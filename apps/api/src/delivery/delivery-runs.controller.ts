import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import {
  CreateDeliveryRunDTO,
  type DriverDeliveryEvent,
  type DriverRouteEvent,
  ReorderDeliveryStopsDTO,
  UpdateDeliveryRunSettingsDTO,
  UpdateDriverPaySettingsDTO,
  DriverAdjustmentDTO,
  TenantCashTipDTO,
  DeliveryRunReasonDTO,
} from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../common/decorators';
import { AuthenticatedRequest } from '../common/interfaces/request.interface';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { PushService } from '../notifications/push.service';
import { DeliveryRunsService } from './delivery-runs.service';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';
import { DriverEarningsService } from './driver-earnings.service';
import { SmartDispatchService } from './smart-dispatch.service';

@Controller('delivery/runs')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DeliveryRunsController {
  constructor(
    private readonly deliveryRunsService: DeliveryRunsService,
    private readonly deliveryTrackingGateway: DeliveryTrackingGateway,
    private readonly pushService: PushService,
    private readonly earningsService: DriverEarningsService,
    private readonly smartDispatchService: SmartDispatchService,
  ) {}

  @Get('builder')
  @RequirePermissions('delivery.read', 'delivery.dispatch')
  getBuilderData(@Request() req: AuthenticatedRequest) {
    return this.deliveryRunsService.getBuilderData(req.user.tenantId);
  }

  @Get('smart-dispatch/suggestion')
  @RequirePermissions('delivery.dispatch')
  getSmartSuggestion(@Request() req: AuthenticatedRequest) {
    return this.smartDispatchService.suggestion(req.user.tenantId);
  }

  @Post('smart-dispatch/accept')
  @RequirePermissions('delivery.dispatch')
  acceptSmartSuggestion(@Request() req: AuthenticatedRequest, @Body() dto: CreateDeliveryRunDTO) {
    return this.smartDispatchService.accept(req.user.tenantId, req.user.id, dto.driverId, dto.orderIds);
  }

  @Post(':id/kds-override')
  @RequirePermissions('delivery.dispatch')
  overrideKdsLock(@Request() req: AuthenticatedRequest, @Param('id') runId: string, @Body() dto: DeliveryRunReasonDTO) {
    return this.deliveryRunsService.overrideKdsLock(req.user.tenantId, runId, req.user.id, dto.reason).then((run) => {
      const occurredAt = new Date().toISOString();
      this.deliveryTrackingGateway.emitDriverRouteEvent(req.user.tenantId, run.driverId, { eventId: `delivery.run_updated:${run.id}:${occurredAt}`, type: 'delivery.run_updated', change: 'updated', runId: run.id, occurredAt });
      return run;
    });
  }

  @Get('pay-settings')
  @RequirePermissions('delivery.read', 'delivery.manage_drivers')
  getPaySettings(@Request() req: AuthenticatedRequest) {
    return this.earningsService.getSettings(req.user.tenantId);
  }

  @Patch('pay-settings')
  @RequirePermissions('delivery.manage_drivers')
  updatePaySettings(@Request() req: AuthenticatedRequest, @Body() dto: UpdateDriverPaySettingsDTO) {
    return this.earningsService.updateSettings(req.user.tenantId, req.user.id, dto);
  }

  @Get('drivers/:driverId/earnings')
  @RequirePermissions('delivery.read', 'delivery.manage_drivers')
  getDriverEarnings(@Request() req: AuthenticatedRequest, @Param('driverId') driverId: string) {
    return this.earningsService.summary(req.user.tenantId, driverId);
  }

  @Post('adjustments')
  @RequirePermissions('delivery.manage_drivers')
  addAdjustment(@Request() req: AuthenticatedRequest, @Body() dto: DriverAdjustmentDTO) {
    return this.earningsService.addAdjustment(req.user.tenantId, dto.driverId, dto.amount, dto.reason, req.user.id);
  }

  @Get('drivers/:driverId/work-state')
  @RequirePermissions('delivery.manage_drivers')
  getDriverWorkState(@Request() req: AuthenticatedRequest, @Param('driverId') driverId: string) {
    return this.deliveryRunsService.getDriverWorkState(req.user.tenantId, driverId);
  }

  @Post('drivers/:driverId/shift/start')
  @RequirePermissions('delivery.manage_drivers')
  startDriverShift(@Request() req: AuthenticatedRequest, @Param('driverId') driverId: string) {
    return this.deliveryRunsService.startShiftForTenant(req.user.tenantId, driverId);
  }

  @Post('drivers/:driverId/shift/end')
  @RequirePermissions('delivery.manage_drivers')
  endDriverShift(@Request() req: AuthenticatedRequest, @Param('driverId') driverId: string) {
    return this.deliveryRunsService.endShiftForTenant(req.user.tenantId, driverId);
  }

  @Post('cash-tips')
  @RequirePermissions('delivery.manage_drivers')
  addCashTip(@Request() req: AuthenticatedRequest, @Body() dto: TenantCashTipDTO) {
    return this.earningsService.addCashTip(req.user.tenantId, dto.driverId, dto.orderId, dto.amount, req.user.id, 'tenant_user');
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
