import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PizzaEngineService } from './pizza-engine.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';

@Controller('catalog/pizza')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class PizzaController {
  constructor(private readonly pizzaEngine: PizzaEngineService) {}

  @Post('simulate')
  @RequirePermissions('catalog.read')
  async simulate(@Body() body: { categoryId: string; sizeId: string; flavors: { productId: string; fraction: number }[] }) {
    return this.pizzaEngine.calculatePrice(body.categoryId, body.sizeId, body.flavors);
  }
}
