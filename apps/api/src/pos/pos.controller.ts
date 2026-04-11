import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { PosService } from './pos.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { CreatePosOrderDTO } from '@gestor/types';

interface TenantRequest {
  user: {
    tenantId: string;
    id: string;
    permissions?: string[];
  };
}

@Controller('pos')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class PosController {
  constructor(private readonly posService: PosService) {}

  // POST /pos/sales
  @Post('sales')
  @RequirePermissions('pos.create_sale')
  async createSale(
    @Request() req: TenantRequest,
    @Body() dto: CreatePosOrderDTO,
  ) {
    const permissions = req.user.permissions || [];
    const hasDiscountPermission =
      permissions.includes('pos.apply_discount') || permissions.includes('cash.manage');

    return this.posService.createSale(
      req.user.tenantId,
      req.user.id,
      dto,
      hasDiscountPermission,
    );
  }

  // GET /pos/sales
  @Get('sales')
  @RequirePermissions('pos.read')
  async listSales(
    @Request() req: TenantRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.posService.listPosSales(req.user.tenantId, page, limit);
  }

  // POST /pos/sales/:id/cancel
  @Post('sales/:id/cancel')
  @RequirePermissions('pos.create_sale')
  async cancelSale(
    @Request() req: TenantRequest,
    @Param('id') orderId: string,
  ) {
    return this.posService.cancelPosSale(
      req.user.tenantId,
      orderId,
      req.user.id,
    );
  }
}
