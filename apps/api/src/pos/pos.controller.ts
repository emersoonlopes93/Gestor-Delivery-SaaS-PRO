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
  Logger,
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
  private readonly logger = new Logger(PosController.name);

  constructor(private readonly posService: PosService) {}

  // POST /pos/sales
  @Post('sales')
  @RequirePermissions('pos.create_sale')
  async createSale(
    @Request() req: TenantRequest,
    @Body() dto: CreatePosOrderDTO,
  ) {
    try {
      this.logger.log(`Creating POS sale for tenant ${req.user.tenantId}, user ${req.user.id}`);
      
      const permissions = req.user.permissions || [];
      const hasDiscountPermission =
        permissions.includes('pos.apply_discount') || permissions.includes('cash.manage');

      const result = await this.posService.createSale(
        req.user.tenantId,
        req.user.id,
        dto,
        hasDiscountPermission,
      );

      this.logger.log(`POS sale created successfully: ${result.orderNumber}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error creating POS sale: ${errorMessage}`, errorStack);
      throw error;
    }
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
