import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ProductOptionItemRecipeComponentInputDTO } from '@gestor/types';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { RequiresFeature } from '../common/decorators/requires-feature.decorator';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { ProductOptionItemRecipesService } from './product-option-item-recipes.service';

@Controller('inventory/recipes/product/:productId/option-item/:optionItemId')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('inventory')
export class ProductOptionItemRecipesController {
  constructor(private readonly service: ProductOptionItemRecipesService) {}

  @Get()
  @RequirePermissions('inventory.read')
  get(@CurrentTenant() tenantId: string, @Param('productId') productId: string, @Param('optionItemId') optionItemId: string) {
    return this.service.get(tenantId, productId, optionItemId);
  }

  @Put()
  @RequirePermissions('inventory.manage_recipe')
  replace(
    @CurrentTenant() tenantId: string,
    @Param('productId') productId: string,
    @Param('optionItemId') optionItemId: string,
    @Body() components: ProductOptionItemRecipeComponentInputDTO[],
  ) {
    return this.service.replace(tenantId, productId, optionItemId, components);
  }
}
