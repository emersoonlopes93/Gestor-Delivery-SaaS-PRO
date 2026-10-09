import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { LossesService } from './losses.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';

@Controller('losses')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class LossesController {
  constructor(private readonly lossesService: LossesService) {}

  @Get()
  @RequirePermissions('inventory.read')
  async findAll(@CurrentTenant() tenantId: string) {
    return this.lossesService.findAll(tenantId);
  }

  @Post()
  @RequirePermissions('inventory.adjust')
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: { ingredientId: string; quantity: number; reason: string },
  ) {
    return this.lossesService.create(tenantId, dto.ingredientId, dto.quantity, dto.reason);
  }
}
