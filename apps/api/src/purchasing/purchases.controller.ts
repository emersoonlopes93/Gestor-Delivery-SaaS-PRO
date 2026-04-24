import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDTO, PurchaseDTO } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant } from '../common/decorators';

@Controller('purchases')
@UseGuards(TenantAuthGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: string): Promise<PurchaseDTO[]> {
    return this.purchasesService.findAll(tenantId);
  }

  @Get(':id')
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ): Promise<PurchaseDTO> {
    return this.purchasesService.findOne(tenantId, id);
  }

  @Post()
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreatePurchaseDTO,
  ): Promise<PurchaseDTO> {
    return this.purchasesService.create(tenantId, dto);
  }
}
