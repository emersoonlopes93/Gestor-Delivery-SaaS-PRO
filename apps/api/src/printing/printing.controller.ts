import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import { PrintingService } from './printing.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import {
  CreatePrinterDeviceDto,
  UpdatePrinterDeviceDto,
  AckSpoolerJobDto,
  FailSpoolerJobDto,
  CreateTestPrintDto,
  UpdatePrintStationDto,
} from './dto/printing.dto';

type TenantRequest = ExpressRequest & { user: TenantJwtPayload };

@Controller('printing')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class PrintingController {
  constructor(private readonly printingService: PrintingService) {}

  @Get('jobs')
  @RequirePermissions('printing.read')
  async getJobs(@Request() req: TenantRequest) {
    return this.printingService.getJobs(req.user.tenantId);
  }

  @Get('stations')
  @RequirePermissions('printing.read')
  async getStations(@Request() req: TenantRequest) {
    return this.printingService.getStations(req.user.tenantId);
  }

  @Patch('stations/:id')
  @RequirePermissions('printing.manage')
  async updateStation(
    @Request() req: TenantRequest,
    @Param('id') id: string,
    @Body() body: UpdatePrintStationDto,
  ) {
    return this.printingService.updateStationActive(req.user.tenantId, id, body.isActive);
  }

  @Get('devices')
  @RequirePermissions('settings.manage')
  async getDevices(@Request() req: TenantRequest) {
    return this.printingService.getDevices(req.user.tenantId);
  }

  @Post('devices')
  @RequirePermissions('settings.manage')
  async createDevice(@Request() req: TenantRequest, @Body() body: CreatePrinterDeviceDto) {
    return this.printingService.createDevice(req.user.tenantId, body);
  }

  @Post('devices/:id')
  @RequirePermissions('settings.manage')
  async updateDevice(
    @Request() req: TenantRequest,
    @Param('id') id: string,
    @Body() body: UpdatePrinterDeviceDto,
  ) {
    return this.printingService.updateDevice(req.user.tenantId, id, body);
  }

  @Post('jobs/:id/reprint')
  @RequirePermissions('printing.reprint')
  async reprintJob(@Request() req: TenantRequest, @Param('id') id: string) {
    return this.printingService.reprintJob(req.user.tenantId, id);
  }

  @Post('test')
  @RequirePermissions('settings.manage')
  async createTestJob(
    @Request() req: TenantRequest,
    @Body() body: CreateTestPrintDto,
  ) {
    return this.printingService.createTestJob(
      req.user.tenantId,
      body.stationSlug,
      body.deviceName,
      body.requestId,
    );
  }

  // Spooler Endpoints (Used by the Android App)
  @Post('spooler/next')
  @RequirePermissions('printing.print')
  async getNextSpoolerJob(
    @Request() req: TenantRequest,
    @Body() body: { printerDeviceId: string },
  ) {
    return this.printingService.getNextSpoolerJob(req.user.tenantId, body.printerDeviceId);
  }

  @Post('spooler/:jobId/ack')
  @RequirePermissions('printing.print')
  async ackSpoolerJob(
    @Request() req: TenantRequest,
    @Param('jobId') jobId: string,
    @Body() body: AckSpoolerJobDto,
  ) {
    return this.printingService.ackSpoolerJob(req.user.tenantId, jobId, body.printerDeviceId);
  }

  @Post('spooler/:jobId/fail')
  @RequirePermissions('printing.print')
  async failSpoolerJob(
    @Request() req: TenantRequest,
    @Param('jobId') jobId: string,
    @Body() body: FailSpoolerJobDto,
  ) {
    return this.printingService.failSpoolerJob(
      req.user.tenantId,
      jobId,
      body.printerDeviceId,
      body.errorMessage,
    );
  }
}
