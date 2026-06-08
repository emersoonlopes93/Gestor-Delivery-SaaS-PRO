import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpsertRecipeDTO, RecipeIngredientDTO, UnitType } from '@gestor/types';
import { UnitType as PrismaUnitType } from '@prisma/client';

@Injectable()
export class RecipesService {
  constructor(private prisma: PrismaService) {}

  private mapUnit(unit: PrismaUnitType): UnitType {
    switch (unit) {
      case PrismaUnitType.un:
        return UnitType.UN;
      case PrismaUnitType.g:
        return UnitType.G;
      case PrismaUnitType.kg:
        return UnitType.KG;
      case PrismaUnitType.ml:
        return UnitType.ML;
      case PrismaUnitType.l:
        return UnitType.L;
    }
  }

  /**
   * PRODUCTS
   */
  async getProductRecipe(tenantId: string, productId: string): Promise<RecipeIngredientDTO[]> {
    const raw = await this.prisma.productRecipeIngredient.findMany({
      where: { productId, tenantId },
      include: { ingredient: true },
    });

    return raw.map(item => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: item.ingredient.name,
      ingredientUnit: this.mapUnit(item.ingredient.unit),
      quantity: Number(item.quantity),
      estimatedCost: Number(item.quantity) * Number(item.ingredient.currentCost),
    }));
  }

  async upsertProductRecipe(tenantId: string, productId: string, ingredients: UpsertRecipeDTO[]) {
    return this.prisma.$transaction(async (tx) => {
      // Clear existing
      await tx.productRecipeIngredient.deleteMany({
        where: { productId, tenantId },
      });

      // Insert new
      if (ingredients.length > 0) {
        await tx.productRecipeIngredient.createMany({
          data: ingredients.map(ing => ({
            tenantId,
            productId,
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
          })),
        });
      }
    });
  }

  /**
   * AGGREGATE COST CALCULATION
   */
  async calculateProductTotalCost(tenantId: string, productId: string): Promise<number> {
    const recipe = await this.getProductRecipe(tenantId, productId);
    return recipe.reduce((acc, curr) => acc + (curr.estimatedCost || 0), 0);
  }
}
