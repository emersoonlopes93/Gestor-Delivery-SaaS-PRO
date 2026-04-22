import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { InventoryCountService } from './inventory-count.service';
import { CreateInventoryCountDTO, InventoryCountDTO } from '@gestor/types';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@Controller('inventory-counts')
@UseGuards(TenantGuard)
export class InventoryCountController {
  constructor(private readonly inventoryCountService: InventoryCountService) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: string): Promise<InventoryCountDTO[]> {
    return this.inventoryCountService.findAll(tenantId);
  }

  @Get(':id')
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<InventoryCountDTO> {
    return this.inventoryCountService.findOne(tenantId, id);
  }

  @Post()
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateInventoryCountDTO,
  ): Promise<InventoryCountDTO> {
    return this.inventoryCountService.create(tenantId, dto);
  }
}
