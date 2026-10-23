import { Prisma, UnitType as PrismaUnitType } from '@prisma/client';
import { UnitType } from '@gestor/types';
import { RecipesService } from './recipes.service';

describe('RecipesService.previewProductRecipeCost', () => {
  it('uses canonical base expansion and returns a labelled partial draft cost without writes', async () => {
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-a' }) },
      ingredient: { findMany: jest.fn().mockResolvedValue([{ id: 'ingredient-a', unit: PrismaUnitType.g }]) },
      recipeBase: { findMany: jest.fn().mockResolvedValue([{ id: 'base-a', outputUnit: PrismaUnitType.ml, isActive: true }]) },
    };
    const expansion = {
      expandRecipeBaseToIngredients: jest.fn().mockResolvedValue(new Map([['ingredient-b', new Prisma.Decimal('40')]])),
      calculateExpandedIngredientCostCoverage: jest.fn().mockResolvedValue({
        coverage: 'PARTIAL', estimatedTotalCost: null, partialEstimatedTotalCost: new Prisma.Decimal('3.25'), knownIngredientCount: 1, unknownIngredientCount: 1,
      }),
    };
    const service = new RecipesService(prisma as never, expansion as never);

    await expect(service.previewProductRecipeCost('tenant-a', 'product-a', [
      { type: 'ingredient', ingredientId: 'ingredient-a', inputQuantity: 250, inputUnit: UnitType.G },
      { type: 'base', baseId: 'base-a', inputQuantity: 100, inputUnit: UnitType.ML },
    ])).resolves.toEqual({
      coverage: 'PARTIAL', estimatedTotalCost: null, partialEstimatedTotalCost: 3.25,
      knownIngredientCount: 1, unknownIngredientCount: 1, basis: 'CURRENT_INGREDIENT_COSTS',
    });
    expect(expansion.expandRecipeBaseToIngredients).toHaveBeenCalledWith('tenant-a', 'base-a', expect.any(Prisma.Decimal));
    expect(expansion.calculateExpandedIngredientCostCoverage).toHaveBeenCalledWith('tenant-a', expect.any(Map));
  });
});
