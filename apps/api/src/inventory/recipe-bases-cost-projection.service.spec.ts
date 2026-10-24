import { Prisma } from '@prisma/client';
import { RecipeBasesService } from './recipe-bases.service';
import { RecipeExpansionService } from './recipe-expansion.service';

const decimal = (value: string) => new Prisma.Decimal(value);

describe('RecipeBasesService costProjection', () => {
  const tenantId = 'tenant-a';
  const base = { id: 'base-a', yieldQuantity: decimal('2.5'), outputUnit: 'l' };

  function setup(coverage: Awaited<ReturnType<RecipeExpansionService['calculateExpandedIngredientCostCoverage']>>) {
    const prisma = {
      recipeBase: { findFirst: jest.fn().mockResolvedValue(base) },
    };
    const expansion = {
      expandRecipeBaseToIngredients: jest.fn().mockResolvedValue(new Map([['ingredient-a', decimal('400')]])),
      calculateExpandedIngredientCostCoverage: jest.fn().mockResolvedValue(coverage),
    };
    return { prisma, expansion, service: new RecipeBasesService(prisma as never, expansion as never) };
  }

  it('returns Decimal-derived total and per-yield cost only when coverage is known', async () => {
    const { service, expansion } = setup({
      coverage: 'KNOWN', estimatedTotalCost: decimal('12.3456'), partialEstimatedTotalCost: null, knownIngredientCount: 2, unknownIngredientCount: 0,
    });

    await expect(service.costProjection(tenantId, base.id)).resolves.toEqual(expect.objectContaining({
      coverage: 'KNOWN', estimatedTotalCost: 12.3456, estimatedCostPerYieldUnit: 4.93824,
      partialEstimatedTotalCost: null, partialEstimatedCostPerYieldUnit: null, basis: 'CURRENT_INGREDIENT_COSTS',
    }));
    expect(expansion.expandRecipeBaseToIngredients).toHaveBeenCalledWith(tenantId, base.id, base.yieldQuantity);
  });

  it('labels a subtotal as partial instead of presenting it as a complete cost', async () => {
    const { service } = setup({
      coverage: 'PARTIAL', estimatedTotalCost: null, partialEstimatedTotalCost: decimal('3'), knownIngredientCount: 1, unknownIngredientCount: 2,
    });

    await expect(service.costProjection(tenantId, base.id)).resolves.toEqual(expect.objectContaining({
      coverage: 'PARTIAL', estimatedTotalCost: null, estimatedCostPerYieldUnit: null,
      partialEstimatedTotalCost: 3, partialEstimatedCostPerYieldUnit: 1.2,
      knownIngredientCount: 1, unknownIngredientCount: 2,
    }));
  });

  it('does not turn absent or zero-cost evidence into a false known zero', async () => {
    const { service } = setup({
      coverage: 'UNKNOWN', estimatedTotalCost: null, partialEstimatedTotalCost: null, knownIngredientCount: 0, unknownIngredientCount: 1,
    });

    await expect(service.costProjection(tenantId, base.id)).resolves.toEqual(expect.objectContaining({
      coverage: 'UNKNOWN', estimatedTotalCost: null, estimatedCostPerYieldUnit: null,
      partialEstimatedTotalCost: null, partialEstimatedCostPerYieldUnit: null,
    }));
  });
});
