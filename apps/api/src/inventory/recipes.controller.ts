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

  @Get('complement/:itemId')
  @RequirePermissions('inventory.read')
  async getComplementRecipe(
    @CurrentTenant() tenantId: string,
    @Param('itemId') itemId: string
  ): Promise<RecipeIngredientDTO[]> {
    return this.recipesService.getComplementRecipe(tenantId, itemId);
  }

  @Post('complement/:itemId')
  @RequirePermissions('inventory.manage_recipe')
  async upsertComplementRecipe(
    @CurrentTenant() tenantId: string,
    @Param('itemId') itemId: string,
    @Body() ingredients: UpsertRecipeDTO[]
  ) {
    return this.recipesService.upsertComplementRecipe(tenantId, itemId, ingredients);
  }

  @Get('combo/:comboId')
  @RequirePermissions('inventory.read')
  async getComboRecipe(
    @CurrentTenant() tenantId: string,
    @Param('comboId') comboId: string
  ): Promise<RecipeIngredientDTO[]> {
    return this.recipesService.getComboRecipe(tenantId, comboId);
  }

  @Post('combo/:comboId')
  @RequirePermissions('inventory.manage_recipe')
  async upsertComboRecipe(
    @CurrentTenant() tenantId: string,
    @Param('comboId') comboId: string,
    @Body() ingredients: UpsertRecipeDTO[]
  ) {
    return this.recipesService.upsertComboRecipe(tenantId, comboId, ingredients);
  }
}
