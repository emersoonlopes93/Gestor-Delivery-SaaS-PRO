import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RecipesService } from './recipes.service';
import { UpsertRecipeDTO, RecipeIngredientDTO } from '@gestor/types';

@Controller('inventory/recipes')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  /**
   * PRODUCTS
   */
  @Get('product/:productId')
  @RequirePermissions('inventory.read')
  async getProductRecipe(
    @CurrentTenant() tenantId: string,
    @Param('productId') productId: string
  ): Promise<RecipeIngredientDTO[]> {
    return this.recipesService.getProductRecipe(tenantId, productId);
  }

  @Post('product/:productId')
  @RequirePermissions('inventory.manage_recipe')
  async upsertProductRecipe(
    @CurrentTenant() tenantId: string,
    @Param('productId') productId: string,
    @Body() ingredients: UpsertRecipeDTO[]
  ) {
    return this.recipesService.upsertProductRecipe(tenantId, productId, ingredients);
  }

}
