import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CreatePurchasePresentationDTO, PurchasePresentationDTO, UpdatePurchasePresentationDTO } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { RequiresFeature } from '../common/decorators/requires-feature.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { PurchasePresentationsService } from './purchase-presentations.service';

@Controller('inventory/ingredients/:ingredientId/purchase-presentations')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('inventory')
export class PurchasePresentationsController {
  constructor(private readonly service: PurchasePresentationsService) {}

  @Get() @RequirePermissions('inventory.read')
  findAll(@CurrentTenant() tenantId: string, @Param('ingredientId') ingredientId: string): Promise<PurchasePresentationDTO[]> {
    return this.service.findAll(tenantId, ingredientId);
  }

  @Post() @RequirePermissions('inventory.update')
  create(@CurrentTenant() tenantId: string, @Param('ingredientId') ingredientId: string, @Body() dto: CreatePurchasePresentationDTO): Promise<PurchasePresentationDTO> {
    return this.service.create(tenantId, ingredientId, dto);
  }

  @Put(':id') @RequirePermissions('inventory.update')
  update(@CurrentTenant() tenantId: string, @Param('ingredientId') ingredientId: string, @Param('id') id: string, @Body() dto: UpdatePurchasePresentationDTO): Promise<PurchasePresentationDTO> {
    return this.service.update(tenantId, ingredientId, id, dto);
  }
}
