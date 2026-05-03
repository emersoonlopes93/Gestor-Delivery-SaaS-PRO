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

@Controller('kds')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class KdsController {
  constructor(private readonly kdsService: KdsService) {}

  @Get('print-jobs/pending')
  @RequirePermissions('orders.view')
  async getPendingPrintJobs(@Query() query: PrintJobQueryDTO) {
    return this.kdsService.getPendingPrintJobs(query.station || 'GERAL', query.limit);
  }

  @Post('spooler/next')
  @RequirePermissions('orders.view')
  @HttpCode(HttpStatus.OK)
  async getNextPrintJob(@Body() body: { station: string }) {
    return this.kdsService.getNextPrintJobForSpooler(body.station || 'GERAL');
  }

  @Get('print-jobs')
  @RequirePermissions('orders.view')
  async getAllPrintJobs(@Query() query: GetPrintJobsQueryDTO) {
    return this.kdsService.getAllPrintJobs(
      query.station || '',
      query.status,
      query.page,
      query.limit,
    );
  }

  @Get('print-jobs/:id')
  @RequirePermissions('orders.view')
  async getPrintJob() {
    throw new NotImplementedException('Not implemented yet');
  }

  @Get('print-jobs/order/:orderId')
  @RequirePermissions('orders.view')
  async getGroupedPrintJobs(@Param('orderId') orderId: string) {
    return this.kdsService.getGroupedPrintJobs(orderId);
  }

  @Get('stations/:station/stats')
  @RequirePermissions('orders.view')
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
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.OK)
  async markAsPrinting(@Param('id') id: string) {
    return this.kdsService.markAsPrinting(id);
  }

  @Put('print-jobs/:id/completed')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.OK)
  async markAsCompleted(@Param('id') id: string) {
    return this.kdsService.markAsCompleted(id);
  }

  @Put('print-jobs/:id/failed')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.OK)
  async markAsFailed(
    @Param('id') id: string,
  ) {
    return this.kdsService.markAsFailed(id);
  }

  @Post('print-jobs/:id/reprint')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.CREATED)
  async reprintPrintJob(@Param('id') id: string) {
    return this.kdsService.reprintPrintJob(id);
  }

  @Delete('print-jobs/:id')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.OK)
  async cancelPrintJob(@Param('id') id: string) {
    await this.kdsService.cancelPrintJob(id);
    return { success: true };
  }

  @Post('print-jobs/cleanup')
  @RequirePermissions('orders.manage')
  @HttpCode(HttpStatus.OK)
  async cleanupOldPrintJobs(@Body() data: CleanupPrintJobsDTO) {
    return this.kdsService.cleanupOldPrintJobs(data.daysOld);
  }
}
