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
import { SplitPaymentService } from './split-payment.service';
import {
  CreateOrderSplitDTO,
  AddPaymentToSplitDTO,
  UpdateOrderSplitDTO,
  CancelOrderSplitDTO,
  SplitByItemsDTO,
  SplitByPeopleDTO,
  CustomSplitDTO,
} from './dto/create-split.dto';

@Controller('split-payment')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class SplitPaymentController {
  constructor(private readonly splitPaymentService: SplitPaymentService) {}

  @Post('splits')
  @RequirePermissions('orders.create')
  @HttpCode(HttpStatus.CREATED)
  async createOrderSplit(@Body() data: CreateOrderSplitDTO) {
    return this.splitPaymentService.createOrderSplit(data);
  }

  @Post('splits/by-items')
  @RequirePermissions('orders.create')
  @HttpCode(HttpStatus.CREATED)
  async splitByItems(@Body() data: SplitByItemsDTO) {
    return this.splitPaymentService.splitByItems(data.orderId, data.items);
  }

  @Post('splits/by-people')
  @RequirePermissions('orders.create')
  @HttpCode(HttpStatus.CREATED)
  async splitByPeople(@Body() data: SplitByPeopleDTO) {
    return this.splitPaymentService.splitByPeople(data.orderId, data.numberOfPeople);
  }

  @Post('splits/custom')
  @RequirePermissions('orders.create')
  @HttpCode(HttpStatus.CREATED)
  async customSplit() {
    throw new NotImplementedException('Use /splits endpoint for manual creation');
  }

  @Get('splits')
  @RequirePermissions('orders.view')
  async getAllOrderSplits(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.splitPaymentService.getAllOrderSplits(
      status as any,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('splits/:id')
  @RequirePermissions('orders.view')
  async getOrderSplit(@Param('id') id: string) {
    return this.splitPaymentService.getSplitSummary(id);
  }

  @Get('orders/:orderId/splits')
  @RequirePermissions('orders.view')
  async getOrderSplits(@Param('orderId') orderId: string) {
    return this.splitPaymentService.getOrderSplits(orderId);
  }

  @Put('splits/:id')
  @RequirePermissions('orders.update')
  async updateOrderSplit() {
    throw new NotImplementedException('Not implemented yet');
  }

  @Post('splits/:id/cancel')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.OK)
  async cancelOrderSplit(
    @Param('id') id: string,
    @Body() data: CancelOrderSplitDTO,
  ) {
    await this.splitPaymentService.cancelOrderSplit(id, data.reason);
    return { success: true };
  }

  @Post('splits/payments')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.CREATED)
  async addPaymentToSplit(@Body() data: AddPaymentToSplitDTO) {
    return this.splitPaymentService.addPaymentToSplit(data);
  }

  @Post('splits/payments/:id/confirm')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.OK)
  async confirmPayment(@Param('id') id: string) {
    return this.splitPaymentService.confirmCashPayment(id);
  }

  @Delete('splits/payments/:id')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.OK)
  async removePaymentFromSplit(@Param('id') id: string) {
    await this.splitPaymentService.removePaymentFromSplit(id);
    return { success: true };
  }
}
