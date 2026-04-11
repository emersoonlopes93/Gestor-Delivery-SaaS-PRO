import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpsertRecipeDTO, RecipeIngredientDTO } from '@gestor/types';

@Injectable()
export class RecipesService {
  constructor(private prisma: PrismaService) {}

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
      ingredientUnit: item.ingredient.unit as any,
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
   * COMPLEMENTS
   */
  async getComplementRecipe(tenantId: string, complementItemId: string): Promise<RecipeIngredientDTO[]> {
    const raw = await this.prisma.complementRecipeIngredient.findMany({
      where: { complementItemId, tenantId },
      include: { ingredient: true },
    });

    return raw.map(item => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: item.ingredient.name,
      ingredientUnit: item.ingredient.unit as any,
      quantity: Number(item.quantity),
      estimatedCost: Number(item.quantity) * Number(item.ingredient.currentCost),
    }));
  }

  async upsertComplementRecipe(tenantId: string, complementItemId: string, ingredients: UpsertRecipeDTO[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.complementRecipeIngredient.deleteMany({
        where: { complementItemId, tenantId },
      });

      if (ingredients.length > 0) {
        await tx.complementRecipeIngredient.createMany({
          data: ingredients.map(ing => ({
            tenantId,
            complementItemId,
            ingredientId: ing.ingredientId,
            quantity: ing.quantity,
          })),
        });
      }
    });
  }

  /**
   * COMBOS
   */
  async getComboRecipe(tenantId: string, comboId: string): Promise<RecipeIngredientDTO[]> {
    const raw = await this.prisma.comboRecipeIngredient.findMany({
      where: { comboId, tenantId },
      include: { ingredient: true },
    });

    return raw.map(item => ({
      id: item.id,
      ingredientId: item.ingredientId,
      ingredientName: item.ingredient.name,
      ingredientUnit: item.ingredient.unit as any,
      quantity: Number(item.quantity),
      estimatedCost: Number(item.quantity) * Number(item.ingredient.currentCost),
    }));
  }

  async upsertComboRecipe(tenantId: string, comboId: string, ingredients: UpsertRecipeDTO[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.comboRecipeIngredient.deleteMany({
        where: { comboId, tenantId },
      });

      if (ingredients.length > 0) {
        await tx.comboRecipeIngredient.createMany({
          data: ingredients.map(ing => ({
            tenantId,
            comboId,
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
