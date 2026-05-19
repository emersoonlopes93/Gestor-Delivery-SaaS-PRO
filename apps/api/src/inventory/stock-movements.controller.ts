import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { StockMovementService } from './stock-movement.service';
import { CreateStockMovementDTO, StockMovementDTO } from '@gestor/types';
import { AuthenticatedRequest } from '../common/interfaces/request.interface';

@Controller('inventory/movements')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class StockMovementsController {
  constructor(private readonly movementService: StockMovementService) {}

  @Get()
  @RequirePermissions('inventory.read')
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query('ingredientId') ingredientId?: string
  ): Promise<Array<StockMovementDTO & { ingredient?: { name: string } }>> {
    return this.movementService.findAll(tenantId, ingredientId);
  }

  @Post()
  @RequirePermissions('inventory.update')
  async createManual(
    @CurrentTenant() tenantId: string,
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateStockMovementDTO
  ): Promise<StockMovementDTO> {
    const userId = req.user.id;
    return this.movementService.createManual(tenantId, userId, dto);
  }
}
