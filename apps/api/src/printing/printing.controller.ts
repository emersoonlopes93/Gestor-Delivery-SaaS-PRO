import { Controller, Get, Post, Body, Param, UseGuards, Req, Put } from '@nestjs/common';
import { PrintingService } from './printing.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { CreatePrinterDeviceDto, AckSpoolerJobDto, FailSpoolerJobDto } from './dto/printing.dto';

@Controller('printing')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class PrintingController {
  constructor(private readonly printingService: PrintingService) {}

  @Get('jobs')
  @RequirePermissions('printing.read')
  async getJobs(@Req() req: any) {
    return this.printingService.getJobs(req.tenantId);
  }

  @Get('stations')
  @RequirePermissions('printing.read')
  async getStations(@Req() req: any) {
    return this.printingService.getStations(req.tenantId);
  }

  @Get('devices')
  @RequirePermissions('printing.manage')
  async getDevices(@Req() req: any) {
    return this.printingService.getDevices(req.tenantId);
  }

  @Post('devices')
  @RequirePermissions('printing.manage')
  async createDevice(@Req() req: any, @Body() body: CreatePrinterDeviceDto) {
    return this.printingService.createDevice(req.tenantId, body);
  }

  @Post('jobs/:id/reprint')
  @RequirePermissions('printing.reprint')
  async reprintJob(@Req() req: any, @Param('id') id: string) {
    return this.printingService.reprintJob(req.tenantId, id);
  }

  @Post('test')
  @RequirePermissions('printing.manage')
  async createTestJob(@Req() req: any, @Body() body: { stationSlug: string, deviceName: string }) {
    return this.printingService.createTestJob(req.tenantId, body.stationSlug, body.deviceName);
  }

  // Spooler Endpoints (Used by the Android App)
  @Post('spooler/next')
  @RequirePermissions('printing.print')
  async getNextSpoolerJob(@Req() req: any, @Body() body: { printerDeviceId: string }) {
    return this.printingService.getNextSpoolerJob(req.tenantId, body.printerDeviceId);
  }

  @Post('spooler/:jobId/ack')
  @RequirePermissions('printing.print')
  async ackSpoolerJob(@Req() req: any, @Param('jobId') jobId: string, @Body() body: AckSpoolerJobDto) {
    return this.printingService.ackSpoolerJob(req.tenantId, jobId, body.printerDeviceId);
  }

  @Post('spooler/:jobId/fail')
  @RequirePermissions('printing.print')
  async failSpoolerJob(@Req() req: any, @Param('jobId') jobId: string, @Body() body: FailSpoolerJobDto) {
    return this.printingService.failSpoolerJob(req.tenantId, jobId, body.printerDeviceId, body.errorMessage);
  }
}
