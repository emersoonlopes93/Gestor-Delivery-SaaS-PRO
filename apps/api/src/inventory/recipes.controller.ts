import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { RecipesService } from './recipes.service';
import { UpsertRecipeDTO, RecipeIngredientDTO } from '@gestor/types';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { Roles } from '../rbac/decorators/roles.decorator';
import { PermissionGate } from '../rbac/guards/permission-gate.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('inventory/recipes')
@UseGuards(JwtAuthGuard, PermissionGate)
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  /**
   * PRODUCTS
   */
  @Get('product/:productId')
  @Roles('inventory.read')
  async getProductRecipe(
    @TenantId() tenantId: string,
    @Param('productId') productId: string
  ): Promise<RecipeIngredientDTO[]> {
    return this.recipesService.getProductRecipe(tenantId, productId);
  }

  @Post('product/:productId')
  @Roles('inventory.manage_recipe')
  async upsertProductRecipe(
    @TenantId() tenantId: string,
    @Param('productId') productId: string,
    @Body() ingredients: UpsertRecipeDTO[]
  ) {
    return this.recipesService.upsertProductRecipe(tenantId, productId, ingredients);
  }

  /**
   * COMPLEMENTS
   */
  @Get('complement/:itemId')
  @Roles('inventory.read')
  async getComplementRecipe(
    @TenantId() tenantId: string,
    @Param('itemId') itemId: string
  ): Promise<RecipeIngredientDTO[]> {
    return this.recipesService.getComplementRecipe(tenantId, itemId);
  }

  @Post('complement/:itemId')
  @Roles('inventory.manage_recipe')
  async upsertComplementRecipe(
    @TenantId() tenantId: string,
    @Param('itemId') itemId: string,
    @Body() ingredients: UpsertRecipeDTO[]
  ) {
    return this.recipesService.upsertComplementRecipe(tenantId, itemId, ingredients);
  }

  /**
   * COMBOS
   */
  @Get('combo/:comboId')
  @Roles('inventory.read')
  async getComboRecipe(
    @TenantId() tenantId: string,
    @Param('comboId') comboId: string
  ): Promise<RecipeIngredientDTO[]> {
    return this.recipesService.getComboRecipe(tenantId, comboId);
  }

  @Post('combo/:comboId')
  @Roles('inventory.manage_recipe')
  async upsertComboRecipe(
    @TenantId() tenantId: string,
    @Param('comboId') comboId: string,
    @Body() ingredients: UpsertRecipeDTO[]
  ) {
    return this.recipesService.upsertComboRecipe(tenantId, comboId, ingredients);
  }
}
