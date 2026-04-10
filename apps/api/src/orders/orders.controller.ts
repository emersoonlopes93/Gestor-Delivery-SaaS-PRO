import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDTO, UpdateOrderStatusDTO, OrderStatus } from '@gestor/types';
import { TenantPermission } from '@gestor/core';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions, Public } from '../common/decorators';
import { UseGuards } from '@nestjs/common';

@Controller('orders')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ----------------------------------------------------------------
  // PUBLIC: Checkout (no auth required)
  // ----------------------------------------------------------------
  @Post('public-checkout/:slug') // Changed to avoid conflict with 'orders' prefix if needed, but actually I use @Controller('orders')
  @Public()
  async checkout(
    @Param('slug') slug: string,
    @Body() dto: CreateOrderDTO,
  ) {
    return this.ordersService.createOrder(slug, dto);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: List orders
  // ----------------------------------------------------------------
  @Get()
  @RequirePermissions('orders.read')
  async listOrders(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
  ) {
    const tenantId = req.user.tenantId;
    return this.ordersService.listOrders(tenantId, page, limit, status);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: Order detail
  // ----------------------------------------------------------------
  @Get(':id')
  @RequirePermissions('orders.read')
  async getOrderDetail(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.ordersService.getOrderDetail(id, tenantId);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: Update status
  // ----------------------------------------------------------------
  @Patch(':id/status')
  @RequirePermissions('orders.update_status')
  async updateOrderStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDTO,
  ) {
    const tenantId = req.user.tenantId;
    return this.ordersService.updateOrderStatus(id, tenantId, dto);
  }
}
