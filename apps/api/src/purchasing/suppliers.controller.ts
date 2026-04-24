import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDTO, UpdateSupplierDTO, SupplierDTO } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant } from '../common/decorators';

@Controller('suppliers')
@UseGuards(TenantAuthGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: string): Promise<SupplierDTO[]> {
    return this.suppliersService.findAll(tenantId);
  }

  @Get(':id')
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<SupplierDTO> {
    return this.suppliersService.findOne(tenantId, id);
  }

  @Post()
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateSupplierDTO,
  ): Promise<SupplierDTO> {
    return this.suppliersService.create(tenantId, dto);
  }

  @Put(':id')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDTO,
  ): Promise<SupplierDTO> {
    return this.suppliersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.suppliersService.remove(tenantId, id);
  }
}
