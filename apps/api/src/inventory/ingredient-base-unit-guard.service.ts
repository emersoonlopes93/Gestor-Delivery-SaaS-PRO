import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export enum IngredientBaseUnitLockReason {
  STOCK_STATE = 'STOCK_STATE',
  STOCK_HISTORY = 'STOCK_HISTORY',
  PURCHASE_HISTORY = 'PURCHASE_HISTORY',
  PURCHASE_PRESENTATION = 'PURCHASE_PRESENTATION',
  PRODUCT_RECIPE = 'PRODUCT_RECIPE',
  RECIPE_BASE = 'RECIPE_BASE',
  COMBO_RECIPE = 'COMBO_RECIPE',
  COMPLEMENT_RECIPE = 'COMPLEMENT_RECIPE',
  INVENTORY_COUNT = 'INVENTORY_COUNT',
}

export class IngredientBaseUnitLockedException extends ConflictException {
  constructor(reasons: IngredientBaseUnitLockReason[]) {
    super({
      code: 'INGREDIENT_BASE_UNIT_LOCKED',
      message: 'A unidade-base nao pode ser alterada porque este insumo ja possui dados dependentes.',
      reasons,
    });
  }
}

type IngredientBaseUnitState = {
  currentStock: Prisma.Decimal;
  currentCost: Prisma.Decimal;
  minStock: Prisma.Decimal | null;
};

type IngredientBaseUnitGuardReader = Pick<Prisma.TransactionClient,
  | 'stockMovement'
  | 'purchaseItem'
  | 'purchasePresentation'
  | 'productRecipeIngredient'
  | 'recipeBaseIngredient'
  | 'comboRecipeIngredient'
  | 'complementRecipeIngredient'
  | 'inventoryCountItem'
>;

/**
 * Guards the immutable operational meaning of Ingredient.unit after use.
 * It only reads dependent state and never performs a conversion or mutation.
 */
@Injectable()
export class IngredientBaseUnitGuardService {
  async assertCanChange(
    tx: IngredientBaseUnitGuardReader,
    tenantId: string,
    ingredientId: string,
    state: IngredientBaseUnitState,
  ): Promise<void> {
    const [
      movement,
      purchaseItem,
      presentation,
      productRecipe,
      recipeBaseIngredient,
      comboRecipe,
      complementRecipe,
      inventoryCountItem,
    ] = await Promise.all([
      tx.stockMovement.findFirst({ where: { tenantId, ingredientId }, select: { id: true } }),
      tx.purchaseItem.findFirst({ where: { tenantId, ingredientId }, select: { id: true } }),
      tx.purchasePresentation.findFirst({ where: { tenantId, ingredientId }, select: { id: true } }),
      tx.productRecipeIngredient.findFirst({ where: { tenantId, ingredientId }, select: { id: true } }),
      tx.recipeBaseIngredient.findFirst({ where: { tenantId, ingredientId }, select: { id: true } }),
      tx.comboRecipeIngredient.findFirst({ where: { tenantId, ingredientId }, select: { id: true } }),
      tx.complementRecipeIngredient.findFirst({ where: { tenantId, ingredientId }, select: { id: true } }),
      tx.inventoryCountItem.findFirst({ where: { tenantId, ingredientId }, select: { id: true } }),
    ]);

    const reasons: IngredientBaseUnitLockReason[] = [];
    if (!state.currentStock.isZero() || !state.currentCost.isZero() || (state.minStock !== null && !state.minStock.isZero())) {
      reasons.push(IngredientBaseUnitLockReason.STOCK_STATE);
    }
    if (movement) reasons.push(IngredientBaseUnitLockReason.STOCK_HISTORY);
    if (purchaseItem) reasons.push(IngredientBaseUnitLockReason.PURCHASE_HISTORY);
    if (presentation) reasons.push(IngredientBaseUnitLockReason.PURCHASE_PRESENTATION);
    if (productRecipe) reasons.push(IngredientBaseUnitLockReason.PRODUCT_RECIPE);
    if (recipeBaseIngredient) reasons.push(IngredientBaseUnitLockReason.RECIPE_BASE);
    if (comboRecipe) reasons.push(IngredientBaseUnitLockReason.COMBO_RECIPE);
    if (complementRecipe) reasons.push(IngredientBaseUnitLockReason.COMPLEMENT_RECIPE);
    if (inventoryCountItem) reasons.push(IngredientBaseUnitLockReason.INVENTORY_COUNT);

    if (reasons.length > 0) throw new IngredientBaseUnitLockedException(reasons);
  }
}
