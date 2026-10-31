export const INVENTORY_API_PATHS = {
  ingredients: '/inventory/ingredients',
  counts: '/inventory-counts',
  openCount: '/inventory-counts/open',
  closeCount: (countId: string) => `/inventory-counts/${countId}/close`,
  cancelCount: (countId: string) => `/inventory-counts/${countId}/cancel`,
  losses: '/losses',
} as const;

export type InventoryCountClosureItem = {
  ingredientId: string;
  physicalStock: number;
};

export function createInventoryCountOpening(ingredientIds: readonly string[]) {
  return { ingredientIds: [...ingredientIds] };
}

export function createInventoryCountClosure(items: readonly InventoryCountClosureItem[]) {
  return {
    items: items.map((item) => ({
      ingredientId: item.ingredientId,
      physicalStock: item.physicalStock,
    })),
  };
}
