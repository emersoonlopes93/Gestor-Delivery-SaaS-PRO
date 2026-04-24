import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LossesService } from './losses.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant } from '../common/decorators';

@Controller('losses')
@UseGuards(TenantAuthGuard)
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
