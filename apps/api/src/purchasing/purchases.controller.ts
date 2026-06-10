import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDTO, PurchaseDTO } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { CurrentTenant, RequirePermissions } from '../common/decorators';

@Controller('purchases')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @RequirePermissions('purchasing.read')
  async findAll(@CurrentTenant() tenantId: string): Promise<PurchaseDTO[]> {
    return this.purchasesService.findAll(tenantId);
  }

  @Get(':id')
  @RequirePermissions('purchasing.read')
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<PurchaseDTO> {
    return this.purchasesService.findOne(tenantId, id);
  }

  @Post()
  @RequirePermissions('purchasing.manage')
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreatePurchaseDTO,
  ): Promise<PurchaseDTO> {
    return this.purchasesService.create(tenantId, dto);
  }
}
