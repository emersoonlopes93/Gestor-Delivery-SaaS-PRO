export const INVENTORY_API_PATHS = {
  ingredients: '/inventory/ingredients',
  counts: '/inventory-counts',
  losses: '/losses',
} as const;

export type InventoryCountSubmissionItem = {
  ingredientId: string;
  theoreticalStock: number;
  physicalStock: number;
};

export function createInventoryCountSubmission(items: readonly InventoryCountSubmissionItem[]) {
  return {
    items: items.map((item) => ({
      ingredientId: item.ingredientId,
      theoreticalStock: item.theoreticalStock,
      physicalStock: item.physicalStock,
    })),
  };
}
