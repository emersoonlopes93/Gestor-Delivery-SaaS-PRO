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
  NotImplementedException,
} from '@nestjs/common';
import { RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { SchedulingService } from './scheduling.service';
import {
  CreateScheduledOrderDTO,
  CreateTimeSlotDTO,
  UpdateScheduledOrderDTO,
  CancelScheduledOrderDTO,
  UpdateTimeSlotDTO,
} from './dto/create-scheduled-order.dto';

@Controller('scheduling')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

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

  @Get('time-slots/available')
  @RequirePermissions('scheduling.view')
  async getAvailableTimeSlots(@Query('date') date: string) {
    if (!date) {
      throw new BadRequestException('Date parameter is required');
    }
    return this.schedulingService.getAvailableTimeSlots(new Date(date));
  }

  @Post('time-slots')
  @RequirePermissions('scheduling.manage')
  @HttpCode(HttpStatus.CREATED)
  async createTimeSlot() {
    throw new NotImplementedException('Use /time-slots/generate for bulk creation');
  }

  @Put('time-slots/:id')
  @RequirePermissions('scheduling.manage')
  async updateTimeSlot() {
    throw new NotImplementedException('Not implemented yet');
  }

  @Delete('time-slots/:id')
  @RequirePermissions('scheduling.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTimeSlot() {
    throw new NotImplementedException('Not implemented yet');
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
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.schedulingService.getAllScheduledOrders(
      date ? new Date(date) : undefined,
      status as any,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('scheduled-orders/:id')
  @RequirePermissions('scheduling.view')
  async getScheduledOrder() {
    throw new NotImplementedException('Not implemented yet');
  }

  @Put('scheduled-orders/:id')
  @RequirePermissions('scheduling.update')
  async updateScheduledOrder() {
    throw new NotImplementedException('Not implemented yet');
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
    @Body() data: { status: string },
  ) {
    return this.schedulingService.updateScheduledOrderStatus(id, data.status as any);
  }

  @Get('customers/:customerId/scheduled-orders')
  @RequirePermissions('scheduling.view')
  async getCustomerScheduledOrders(
    @Param('customerId') customerId: string,
    @Query('status') status?: string,
  ) {
    return this.schedulingService.getCustomerScheduledOrders(
      customerId,
      status as any,
    );
  }
}
