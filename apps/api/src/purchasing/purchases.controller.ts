import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDTO, PayPurchaseDTO, PurchaseDTO } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { CurrentTenant, CurrentUser, RequirePermissions } from '../common/decorators';
import { RequiresFeature } from '../common/decorators/requires-feature.decorator';

@Controller('purchasing/purchases')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('purchasing')
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
    @CurrentUser('sub') actorId: string,
  ): Promise<PurchaseDTO> {
    return this.purchasesService.create(tenantId, dto, actorId);
  }

  @Post(':id/pay')
  @RequirePermissions('purchasing.manage')
  async pay(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: PayPurchaseDTO,
    @CurrentUser('sub') actorId: string,
  ): Promise<PurchaseDTO> {
    return this.purchasesService.pay(tenantId, id, dto, actorId);
  }

  @Post(':id/cancel')
  @RequirePermissions('purchasing.manage')
  async cancel(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<PurchaseDTO> {
    return this.purchasesService.cancel(tenantId, id, actorId);
  }
}
