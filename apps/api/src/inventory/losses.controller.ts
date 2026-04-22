import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LossesService } from './losses.service';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@Controller('losses')
@UseGuards(TenantGuard)
export class LossesController {
  constructor(private readonly lossesService: LossesService) {}

  @Post()
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: { ingredientId: string; quantity: number; reason: string },
  ) {
    return this.lossesService.create(tenantId, dto.ingredientId, dto.quantity, dto.reason);
  }
}
