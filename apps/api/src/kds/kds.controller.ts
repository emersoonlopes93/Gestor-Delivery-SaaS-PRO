import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotImplementedException,
} from '@nestjs/common';
import { RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { KdsService } from './kds.service';
import {
  CreatePrintJobDTO,
  CreateIncrementalPrintJobDTO,
  CreateMultipleIncrementalPrintJobsDTO,
  CleanupPrintJobsDTO,
  GetPrintJobsQueryDTO,
  PrintJobQueryDTO,
} from './dto/kds.dto';
import { PrintJobStatus } from '@gestor/types';

@Controller('kds')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class KdsController {
  constructor(private readonly kdsService: KdsService) {}

  @Get('print-jobs/pending')
  @RequirePermissions('kds.use')
  async getPendingPrintJobs(@Query() query: PrintJobQueryDTO) {
    return this.kdsService.getPendingPrintJobs(query.station || 'GERAL', query.limit);
  }

  @Get('stations')
  @RequirePermissions('kds.use')
  async getAvailableStations() {
    return this.kdsService.getAvailableStations();
  }

  @Post('spooler/next')
  @RequirePermissions('kds.use')
  @HttpCode(HttpStatus.OK)
  async getNextPrintJob(@Body() body: { station: string }) {
    return this.kdsService.getNextPrintJobForSpooler(body.station || 'GERAL');
  }

  @Get('print-jobs')
  @RequirePermissions('kds.use')
  async getAllPrintJobs(@Query() query: GetPrintJobsQueryDTO) {
    const station = query.station === 'ALL' ? '' : query.station || '';
    return this.kdsService.getAllPrintJobs(
      station,
      query.status as PrintJobStatus, // Cast simples de enum Prisma para DTO @gestor/types (são compatíveis por string)
      query.page,
      query.limit,
    );
  }

  @Get('print-jobs/:id')
  @RequirePermissions('kds.use')
  async getPrintJob() {
    throw new NotImplementedException('Not implemented yet');
  }

  @Get('print-jobs/order/:orderId')
  @RequirePermissions('kds.use')
  async getGroupedPrintJobs(@Param('orderId') orderId: string) {
    return this.kdsService.getGroupedPrintJobs(orderId);
  }

  @Get('stations/:station/stats')
  @RequirePermissions('kds.use')
  async getStationStats(@Param('station') station: string) {
    return this.kdsService.getStationStats(station);
  }

  @Post('print-jobs')
  @RequirePermissions('orders.create')
  @HttpCode(HttpStatus.CREATED)
  async createPrintJob(@Body() data: CreatePrintJobDTO) {
    return this.kdsService.createPrintJob(data);
  }

  @Post('print-jobs/incremental')
  @RequirePermissions('orders.create')
  @HttpCode(HttpStatus.CREATED)
  async createIncrementalPrintJob(@Body() data: CreateIncrementalPrintJobDTO) {
    return this.kdsService.createIncrementalPrintJob(data);
  }

  @Post('print-jobs/incremental/batch')
  @RequirePermissions('orders.create')
  @HttpCode(HttpStatus.CREATED)
  async createMultipleIncrementalPrintJobs(@Body() data: CreateMultipleIncrementalPrintJobsDTO) {
    return this.kdsService.createIncrementalPrintJobsForOrder(data);
  }

  @Put('print-jobs/:id/printing')
  @RequirePermissions('kds.use')
  @HttpCode(HttpStatus.OK)
  async markAsPrinting(@Param('id') id: string) {
    return this.kdsService.markAsPrinting(id);
  }

  @Put('print-jobs/:id/completed')
  @RequirePermissions('kds.use')
  @HttpCode(HttpStatus.OK)
  async markAsCompleted(@Param('id') id: string) {
    return this.kdsService.markAsCompleted(id);
  }

  @Put('print-jobs/:id/failed')
  @RequirePermissions('kds.use')
  @HttpCode(HttpStatus.OK)
  async markAsFailed(
    @Param('id') id: string,
  ) {
    return this.kdsService.markAsFailed(id);
  }

  @Post('print-jobs/:id/reprint')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.CREATED)
  async reprint(@Param('id') id: string) {
    return this.kdsService.retryPrintJob(id);
  }

  @Delete('print-jobs/:id')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string) {
    await this.kdsService.cancelPrintJobs({ orderId: id }); // Or handle by ID if needed, but cancelPrintJobs handles by filters
  }


  @Post('print-jobs/cleanup')
  @RequirePermissions('kds.manage')
  @HttpCode(HttpStatus.OK)
  async cleanup(@Body() data: CleanupPrintJobsDTO) {
    return this.kdsService.cleanupOldJobs(data.daysOld);
  }
}
