import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';
import { CreateInventoryCountDTO, InventoryCountDTO } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';

@Controller('inventory-counts')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class InventoryCountController {
  constructor(private readonly inventoryCountService: InventoryCountService) {}

  @Get()
  @RequirePermissions('inventory.read')
  async findAll(@CurrentTenant() tenantId: string): Promise<InventoryCountDTO[]> {
    return this.inventoryCountService.findAll(tenantId);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<InventoryCountDTO> {
    return this.inventoryCountService.findOne(tenantId, id);
  }

  @Post()
  @RequirePermissions('inventory.adjust')
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateInventoryCountDTO,
  ): Promise<InventoryCountDTO> {
    return this.inventoryCountService.create(tenantId, dto);
  }
}
