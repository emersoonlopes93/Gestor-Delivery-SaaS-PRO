export type PizzaSelectableItem = {
  id: string;
  name: string;
};

export function isPizzaCategory(category?: { templateType?: string | null } | null): boolean {
  return category?.templateType === 'pizza';
}

export function isHalfAndHalfMounting(itemId: string | null | undefined, items: PizzaSelectableItem[]): boolean {
  if (!itemId) return false;
  const item = items.find((entry) => entry.id === itemId);
  return Boolean(item && item.name.toLowerCase().includes('meio'));
}

export function getPizzaFlavorSelectionLimit(
  mountingItemId: string | null | undefined,
  mountingItems: PizzaSelectableItem[],
): number {
  return isHalfAndHalfMounting(mountingItemId, mountingItems) ? 2 : 1;
}

export function normalizePizzaFlavorSelection(
  currentIds: string[],
  clickedFlavorId: string,
  selectionLimit: number,
): string[] {
  if (selectionLimit <= 1) {
    return [clickedFlavorId];
  }

  if (currentIds.includes(clickedFlavorId)) {
    if (currentIds.length === 1) return currentIds;
    return currentIds.filter((id) => id !== clickedFlavorId);
  }

  if (currentIds.length >= selectionLimit) {
    return currentIds;
  }

  return [...currentIds, clickedFlavorId];
}

export function trimPizzaFlavorSelection(
  currentIds: string[],
  selectionLimit: number,
  fallbackFlavorId?: string | null,
): string[] {
  const normalizedLimit = Math.max(1, selectionLimit);
  const trimmed = currentIds.filter(Boolean).slice(0, normalizedLimit);
  if (trimmed.length > 0) return trimmed;
  return fallbackFlavorId ? [fallbackFlavorId] : [];
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
