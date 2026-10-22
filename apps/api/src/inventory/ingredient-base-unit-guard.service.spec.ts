import { Prisma } from '@prisma/client';
import {
  IngredientBaseUnitGuardService,
  IngredientBaseUnitLockedException,
  IngredientBaseUnitLockReason,
} from './ingredient-base-unit-guard.service';

const relationNames = [
  'stockMovement',
  'purchaseItem',
  'purchasePresentation',
  'productRecipeIngredient',
  'productOptionItemRecipeIngredient',
  'recipeBaseIngredient',
  'comboRecipeIngredient',
  'complementRecipeIngredient',
  'inventoryCountItem',
] as const;

function createReader(activeRelation?: typeof relationNames[number]) {
  const reader = Object.fromEntries(relationNames.map((name) => [
    name,
    { findFirst: jest.fn().mockResolvedValue(name === activeRelation ? { id: `${name}-1` } : null) },
  ]));
  return reader;
}

const unusedState = {
  currentStock: new Prisma.Decimal(0),
  currentCost: new Prisma.Decimal(0),
  minStock: new Prisma.Decimal(0),
};

describe('IngredientBaseUnitGuardService', () => {
  const service = new IngredientBaseUnitGuardService();

  it('permits a real unit change for an unused ingredient and scopes every read to the tenant', async () => {
    const reader = createReader();

    await expect(service.assertCanChange(reader as never, 'tenant-a', 'ingredient-a', unusedState)).resolves.toBeUndefined();

    for (const name of relationNames) {
      expect(reader[name].findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId: 'tenant-a', ingredientId: 'ingredient-a' },
      }));
    }
  });

  it.each([
    ['current stock', { ...unusedState, currentStock: new Prisma.Decimal('0.0001') }],
    ['current cost', { ...unusedState, currentCost: new Prisma.Decimal('0.0001') }],
    ['minimum stock', { ...unusedState, minStock: new Prisma.Decimal('0.0001') }],
  ])('blocks when %s has base-unit semantics', async (_label, state) => {
    await expect(service.assertCanChange(createReader() as never, 'tenant-a', 'ingredient-a', state)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INGREDIENT_BASE_UNIT_LOCKED', reasons: [IngredientBaseUnitLockReason.STOCK_STATE] }),
      status: 409,
    });
  });

  it.each([
    ['stockMovement', IngredientBaseUnitLockReason.STOCK_HISTORY],
    ['purchaseItem', IngredientBaseUnitLockReason.PURCHASE_HISTORY],
    ['purchasePresentation', IngredientBaseUnitLockReason.PURCHASE_PRESENTATION],
    ['productRecipeIngredient', IngredientBaseUnitLockReason.PRODUCT_RECIPE],
    ['productOptionItemRecipeIngredient', IngredientBaseUnitLockReason.PRODUCT_OPTION_RECIPE],
    ['recipeBaseIngredient', IngredientBaseUnitLockReason.RECIPE_BASE],
    ['comboRecipeIngredient', IngredientBaseUnitLockReason.COMBO_RECIPE],
    ['complementRecipeIngredient', IngredientBaseUnitLockReason.COMPLEMENT_RECIPE],
    ['inventoryCountItem', IngredientBaseUnitLockReason.INVENTORY_COUNT],
  ] as const)('blocks when %s exists', async (relation, reason) => {
    await expect(service.assertCanChange(createReader(relation) as never, 'tenant-a', 'ingredient-a', unusedState)).rejects.toBeInstanceOf(IngredientBaseUnitLockedException);
    await expect(service.assertCanChange(createReader(relation) as never, 'tenant-a', 'ingredient-a', unusedState)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INGREDIENT_BASE_UNIT_LOCKED', reasons: [reason] }),
    });
  });
});
