import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  DeliveryRunReasonDTO,
  type DeliveryRunDTO,
  type DriverRouteEvent,
  UpdateDriverOperationalStatusDTO,
} from '@gestor/types';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces/request.interface';
import { DriversService } from './drivers.service';
import { UpdateDriverLocationDTO } from './dto/update-driver-location.dto';
import { DeliveryRunsService } from './delivery-runs.service';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';

@Controller('delivery/driver')
@UseGuards(DriverAuthGuard)
export class DriverOperationsController {
  constructor(
    private readonly driversService: DriversService,
    private readonly deliveryRunsService: DeliveryRunsService,
    private readonly deliveryTrackingGateway: DeliveryTrackingGateway,
  ) {}

  @Get('work-state')
  getWorkState(@Req() req: AuthenticatedRequest) {
    return this.deliveryRunsService.getDriverWorkState(req.user.tenantId, req.user.id);
  }

  @Get('active-run')
  getActiveRun(@Req() req: AuthenticatedRequest) {
    return this.deliveryRunsService.getActiveRunForDriver(req.user.tenantId, req.user.id);
  }

  @Get('active-runs')
  getDeprecatedActiveRun(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Deprecation', 'true');
    response.setHeader('Link', '</delivery/driver/active-run>; rel="successor-version"');
    return this.getActiveRun(req);
  }

  @Post('shift/start')
  startShift(@Req() req: AuthenticatedRequest) {
    return this.deliveryRunsService.startShiftForDriver(req.user.tenantId, req.user.id);
  }

  @Post('shift/end')
  endShift(@Req() req: AuthenticatedRequest) {
    return this.deliveryRunsService.endShiftForDriver(req.user.tenantId, req.user.id);
  }

  @Post('runs/:id/accept')
  async acceptRun(@Req() req: AuthenticatedRequest, @Param('id') runId: string) {
    await this.deliveryRunsService.acceptRun(req.user.tenantId, runId, req.user.id);
    return this.refreshAndEmit(req, runId, 'delivery.run_updated');
  }

  @Post('runs/:id/reject')
  async rejectRun(
    @Req() req: AuthenticatedRequest,
    @Param('id') runId: string,
    @Body() body: DeliveryRunReasonDTO,
  ) {
    await this.deliveryRunsService.rejectRun(
      req.user.tenantId,
      runId,
      req.user.id,
      body.reason,
    );
    this.emitRouteEvent(req, runId, 'delivery.run_updated');
    return null;
  }

  @Post('runs/:id/start')
  async startRun(@Req() req: AuthenticatedRequest, @Param('id') runId: string) {
    await this.deliveryRunsService.startRun(req.user.tenantId, runId, req.user.id);
    return this.refreshAndEmit(req, runId, 'delivery.run_updated');
  }

  @Post('runs/:id/stops/:stopId/arrived')
  async markArrived(
    @Req() req: AuthenticatedRequest,
    @Param('id') runId: string,
    @Param('stopId') stopId: string,
  ) {
    await this.deliveryRunsService.markStopArrived(
      req.user.tenantId,
      runId,
      stopId,
      req.user.id,
    );
    return this.refreshAndEmit(req, runId, 'delivery.stop_updated', stopId);
  }

  @Post('runs/:id/stops/:stopId/complete')
  async completeStop(
    @Req() req: AuthenticatedRequest,
    @Param('id') runId: string,
    @Param('stopId') stopId: string,
  ) {
    await this.deliveryRunsService.completeStop(
      req.user.tenantId,
      runId,
      stopId,
      req.user.id,
    );
    return this.refreshAndEmit(req, runId, 'delivery.stop_updated', stopId);
  }

  @Post('runs/:id/stops/:stopId/failed')
  async markFailed(
    @Req() req: AuthenticatedRequest,
    @Param('id') runId: string,
    @Param('stopId') stopId: string,
    @Body() body: DeliveryRunReasonDTO,
  ) {
    await this.deliveryRunsService.markFailedAttempt(
      req.user.tenantId,
      runId,
      stopId,
      req.user.id,
      body.reason,
    );
    return this.refreshAndEmit(req, runId, 'delivery.stop_updated', stopId);
  }

  @Post('runs/:id/stops/:stopId/returned')
  async confirmReturn(
    @Req() req: AuthenticatedRequest,
    @Param('id') runId: string,
    @Param('stopId') stopId: string,
  ) {
    await this.deliveryRunsService.confirmReturnedToStore(
      req.user.tenantId,
      runId,
      stopId,
      req.user.id,
    );
    return this.refreshAndEmit(req, runId, 'delivery.stop_updated', stopId);
  }

  @Post('runs/:id/complete')
  async completeRun(@Req() req: AuthenticatedRequest, @Param('id') runId: string) {
    await this.deliveryRunsService.completeRun(req.user.tenantId, runId, req.user.id);
    return this.refreshAndEmit(req, runId, 'delivery.run_updated');
  }

  @Post('location')
  updateMyLocation(@Req() req: AuthenticatedRequest, @Body() data: UpdateDriverLocationDTO) {
    return this.driversService.updateDriverLocation(req.user.tenantId, req.user.id, data);
  }

  @Patch('status')
  updateMyStatus(
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateDriverOperationalStatusDTO,
  ) {
    return this.driversService.updateOperationalStatus(req.user.tenantId, req.user.id, data.status);
  }

  private async refreshAndEmit(
    req: AuthenticatedRequest,
    runId: string,
    type: DriverRouteEvent['type'],
    stopId?: string,
  ): Promise<DeliveryRunDTO | null> {
    const run = await this.deliveryRunsService.getActiveRunForDriver(
      req.user.tenantId,
      req.user.id,
    );
    this.emitRouteEvent(req, runId, type, stopId);
    return run;
  }

  private emitRouteEvent(
    req: AuthenticatedRequest,
    runId: string,
    type: DriverRouteEvent['type'],
    stopId?: string,
  ) {
    const occurredAt = new Date().toISOString();
    const event: DriverRouteEvent = {
      eventId: `${type}:${runId}:${stopId ?? 'run'}:${occurredAt}`,
      type,
      change: 'updated',
      runId,
      ...(stopId ? { stopId } : {}),
      occurredAt,
    };
    this.deliveryTrackingGateway.emitDriverRouteEvent(
      req.user.tenantId,
      req.user.id,
      event,
    );
  }
}
