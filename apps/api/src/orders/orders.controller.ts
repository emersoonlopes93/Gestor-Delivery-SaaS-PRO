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
import type { Request as ExpressRequest } from 'express';
import { OrdersService } from './orders.service';
import { CreateOrderDTO, UpdateOrderStatusDTO, OrderStatus } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions, Public } from '../common/decorators';
import { UseGuards } from '@nestjs/common';
import type { TenantJwtPayload } from '@gestor/types';
import { Throttle } from '@nestjs/throttler';

type TenantRequest = ExpressRequest & { user: TenantJwtPayload };

@Controller('orders')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ----------------------------------------------------------------
  // PUBLIC: Checkout (no auth required)
  // ----------------------------------------------------------------
  @Post('public-checkout/:slug') // Changed to avoid conflict with 'orders' prefix if needed, but actually I use @Controller('orders')
  @Public()
  @Throttle({ public: { limit: 60, ttl: 60 } })
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
    @Request() req: TenantRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
  ) {
    const tenantId = req.user.tenantId;
    return this.ordersService.listOrders(tenantId, page, limit, status);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: Operational Board
  // ----------------------------------------------------------------
  @Get('operation/board')
  @RequirePermissions('orders.use_kanban')
  async getBoardOrders(
    @Request() req: TenantRequest,
    @Query('fulfillmentType') fulfillmentType?: 'delivery' | 'pickup',
  ) {
    const tenantId = req.user.tenantId;
    return this.ordersService.getBoardOrders(tenantId, fulfillmentType);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: Kitchen Display System (KDS)
  // ----------------------------------------------------------------
  @Get('operation/kds')
  @RequirePermissions('kds.use')
  async getKdsOrders(@Request() req: TenantRequest) {
    const tenantId = req.user.tenantId;
    return this.ordersService.getKdsOrders(tenantId);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: Order detail
  // ----------------------------------------------------------------
  @Get(':id')
  @RequirePermissions('orders.read')
  async getOrderDetail(
    @Request() req: TenantRequest,
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
    @Request() req: TenantRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDTO,
  ) {
    const tenantId = req.user.tenantId;
    return this.ordersService.updateOrderStatus(id, tenantId, dto);
  }

  // ----------------------------------------------------------------
  // TENANT INTERNAL: Dispatch (Phase 6)
  // ----------------------------------------------------------------
  @Get('operation/dispatch')
  @RequirePermissions('delivery.read')
  async getDispatchOrders(@Request() req: TenantRequest) {
    const tenantId = req.user.tenantId;
    return this.ordersService.getDispatchOrders(tenantId);
  }

  @Post(':id/assign-driver')
  @RequirePermissions('delivery.dispatch')
  async assignDriver(
    @Request() req: TenantRequest,
    @Param('id') id: string,
    @Body() dto: { driverId: string | null },
  ) {
    const tenantId = req.user.tenantId;
    const actorId = req.user.sub; // User performing the action
    return this.ordersService.assignDriver(tenantId, id, dto.driverId, actorId);
  }
}
