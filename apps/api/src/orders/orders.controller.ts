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
import type { CreateOrderDTO, UpdateOrderStatusDTO, OrderStatus } from '@gestor/types';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ----------------------------------------------------------------
  // PUBLIC: Checkout (no auth required)
  // ----------------------------------------------------------------
  @Post('public/storefront/:slug/checkout')
  async checkout(
    @Param('slug') slug: string,
    @Body() dto: CreateOrderDTO,
  ) {
    return this.ordersService.createOrder(slug, dto);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: List orders
  // ----------------------------------------------------------------
  @Get('orders')
  async listOrders(
    @Request() req: { tenantId: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.listOrders(req.tenantId, page, limit, status);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: Order detail
  // ----------------------------------------------------------------
  @Get('orders/:id')
  async getOrderDetail(
    @Request() req: { tenantId: string },
    @Param('id') id: string,
  ) {
    return this.ordersService.getOrderDetail(id, req.tenantId);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: Update status
  // ----------------------------------------------------------------
  @Patch('orders/:id/status')
  async updateOrderStatus(
    @Request() req: { tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDTO,
  ) {
    return this.ordersService.updateOrderStatus(id, req.tenantId, dto);
  }
}
