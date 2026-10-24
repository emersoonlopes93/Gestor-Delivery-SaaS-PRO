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
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { SchedulingService } from './scheduling.service';
import { SchedulingGeneratorService } from './scheduling-generator.service';
import {
  CreateScheduledOrderDTO,
  CancelScheduledOrderDTO,
  CreateTimeSlotDTO,
  UpdateScheduledOrderDTO,
  UpdateTimeSlotDTO,
} from './dto/create-scheduled-order.dto';
import { UpdateSchedulingSettingsDto } from './dto/scheduling-settings.dto';
import {
  CreateSchedulingWindowDTO,
  UpdateSchedulingWindowDTO,
} from './dto/scheduling-window.dto';
import { ScheduledOrderStatus } from '@prisma/client';

@Controller('scheduling')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class SchedulingController {
  private readonly logger = new Logger(SchedulingController.name);

  constructor(
    private readonly schedulingService: SchedulingService,
    private readonly schedulingGenerator: SchedulingGeneratorService,
  ) {}

  private async autoGenerateSlots() {
    try {
      await this.schedulingGenerator.generateSlotsForNextDays();
    } catch (error) {
      this.logger.error(
        `Auto-generate slots failed after scheduling update: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Post('time-slots/generate')
  @RequirePermissions('scheduling.manage')
  @HttpCode(HttpStatus.CREATED)
  async generateTimeSlots(@Body() data: {
    startDate: string;
    endDate: string;
    slotDurationMinutes?: number;
    capacity?: number;
  }) {
    return this.schedulingService.generateTimeSlots(
      new Date(data.startDate),
      new Date(data.endDate),
      data.slotDurationMinutes,
      data.capacity,
    );
  }

  @Post('time-slots/auto-generate')
  @RequirePermissions('scheduling.manage')
  @HttpCode(HttpStatus.OK)
  async autoGenerateTimeSlots() {
    const result = await this.schedulingGenerator.generateSlotsForNextDays();
    return {
      success: true,
      resultCount: result.reduce((total, item) => total + item.created.count, 0),
    };
  }

  @Get('time-slots/available')
  @RequirePermissions('scheduling.view')
  async getAvailableTimeSlots(@Query('date') date: string) {
    if (!date) {
      throw new BadRequestException('Date parameter is required');
    }
    return this.schedulingService.getAvailableTimeSlots(new Date(date));
  }

  @Get('settings')
  @RequirePermissions('scheduling.view')
  async getSchedulingSettings() {
    return this.schedulingService.getSchedulingSettings();
  }

  @Put('settings')
  @RequirePermissions('scheduling.manage')
  async updateSchedulingSettings(@Body() dto: UpdateSchedulingSettingsDto) {
    const updated = await this.schedulingService.updateSchedulingSettings(dto);
    await this.autoGenerateSlots();
    return updated;
  }

  @Get('windows')
  @RequirePermissions('scheduling.view')
  async getSchedulingWindows() {
    return this.schedulingService.getSchedulingWindows();
  }

  @Post('windows')
  @RequirePermissions('scheduling.manage')
  @HttpCode(HttpStatus.CREATED)
  async createSchedulingWindow(@Body() dto: CreateSchedulingWindowDTO) {
    const created = await this.schedulingService.createSchedulingWindow(dto);
    await this.autoGenerateSlots();
    return created;
  }

  @Put('windows/:id')
  @RequirePermissions('scheduling.manage')
  async updateSchedulingWindow(
    @Param('id') id: string,
    @Body() dto: UpdateSchedulingWindowDTO,
  ) {
    const updated = await this.schedulingService.updateSchedulingWindow(id, dto);
    await this.autoGenerateSlots();
    return updated;
  }

  @Delete('windows/:id')
  @RequirePermissions('scheduling.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSchedulingWindow(@Param('id') id: string) {
    await this.schedulingService.deleteSchedulingWindow(id);
  }

  @Post('time-slots')
  @RequirePermissions('scheduling.manage')
  @HttpCode(HttpStatus.CREATED)
  async createTimeSlot(@Body() dto: CreateTimeSlotDTO) {
    return this.schedulingService.createTimeSlot(dto);
  }

  @Put('time-slots/:id')
  @RequirePermissions('scheduling.manage')
  async updateTimeSlot(@Param('id') id: string, @Body() dto: UpdateTimeSlotDTO) {
    return this.schedulingService.updateTimeSlot(id, dto);
  }

  @Delete('time-slots/:id')
  @RequirePermissions('scheduling.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTimeSlot(@Param('id') id: string) {
    await this.schedulingService.deleteTimeSlot(id);
  }

  @Post('scheduled-orders')
  @RequirePermissions('scheduling.create')
  @HttpCode(HttpStatus.CREATED)
  async createScheduledOrder(@Body() data: CreateScheduledOrderDTO) {
    return this.schedulingService.createScheduledOrder({
      customerId: data.customerId,
      scheduledFor: new Date(data.scheduledFor),
      timeSlotId: data.timeSlotId,
      estimatedDuration: data.estimatedDuration,
      notes: data.notes,
    });
  }

  @Get('scheduled-orders')
  @RequirePermissions('scheduling.view')
  async getAllScheduledOrders(
    @Query('date') date?: string,
    @Query('status') status?: ScheduledOrderStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.schedulingService.getAllScheduledOrders(
      date ? new Date(date) : undefined,
      status,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('scheduled-orders/:id')
  @RequirePermissions('scheduling.view')
  async getScheduledOrder(@Param('id') id: string) {
    return this.schedulingService.getScheduledOrder(id);
  }

  @Put('scheduled-orders/:id')
  @RequirePermissions('scheduling.update')
  async updateScheduledOrder(
    @Param('id') id: string,
    @Body() dto: UpdateScheduledOrderDTO,
  ) {
    return this.schedulingService.updateScheduledOrder(id, dto);
  }

  @Post('scheduled-orders/:id/confirm')
  @RequirePermissions('scheduling.update')
  @HttpCode(HttpStatus.OK)
  async confirmScheduledOrder(@Param('id') id: string) {
    return this.schedulingService.confirmScheduledOrder(id);
  }

  @Post('scheduled-orders/:id/cancel')
  @RequirePermissions('scheduling.update')
  @HttpCode(HttpStatus.OK)
  async cancelScheduledOrder(
    @Param('id') id: string,
    @Body() data: CancelScheduledOrderDTO,
  ) {
    await this.schedulingService.cancelScheduledOrder(id, data.reason);
    return { success: true };
  }

  @Get('scheduled-orders/:id/eta')
  @RequirePermissions('scheduling.view')
  async getETA(@Param('id') id: string) {
    return this.schedulingService.calculateETA(id);
  }

  @Put('scheduled-orders/:id/status')
  @RequirePermissions('scheduling.update')
  async updateScheduledOrderStatus(
    @Param('id') id: string,
    @Body() data: { status: ScheduledOrderStatus },
  ) {
    return this.schedulingService.updateScheduledOrderStatus(id, data.status);
  }

  @Get('customers/:customerId/scheduled-orders')
  @RequirePermissions('scheduling.view')
  async getCustomerScheduledOrders(
    @Param('customerId') customerId: string,
    @Query('status') status?: ScheduledOrderStatus,
  ) {
    return this.schedulingService.getCustomerScheduledOrders(
      customerId,
      status,
    );
  }
}
