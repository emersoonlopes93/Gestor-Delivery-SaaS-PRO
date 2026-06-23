import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDTO, UpdateSupplierDTO, SupplierDTO } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { RequiresFeature } from '../common/decorators/requires-feature.decorator';

@Controller('purchasing/suppliers')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('purchasing')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @RequirePermissions('purchasing.read')
  async findAll(@CurrentTenant() tenantId: string): Promise<SupplierDTO[]> {
    return this.suppliersService.findAll(tenantId);
  }

  @Get(':id')
  @RequirePermissions('purchasing.read')
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<SupplierDTO> {
    return this.suppliersService.findOne(tenantId, id);
  }

  @Post()
  @RequirePermissions('purchasing.manage')
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateSupplierDTO,
  ): Promise<SupplierDTO> {
    return this.suppliersService.create(tenantId, dto);
  }

  @Put(':id')
  @RequirePermissions('purchasing.manage')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDTO,
  ): Promise<SupplierDTO> {
    return this.suppliersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('purchasing.manage')
  async remove(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.suppliersService.remove(tenantId, id);
  }
}
