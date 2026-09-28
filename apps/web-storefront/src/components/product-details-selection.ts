import type { CartSelectedOptionGroup, StorefrontProductPayload } from '@gestor/types';

export function reconcileGenericSelections(
  optionGroupLinks: StorefrontProductPayload['optionGroupLinks'],
  current: CartSelectedOptionGroup[],
): CartSelectedOptionGroup[] {
  return (optionGroupLinks ?? []).map((link) => {
    const selected = current.find((group) => group.optionGroupId === link.optionGroup.id);
    const availableItemIds = new Set(link.optionGroup.items.filter((item) => item.isActive).map((item) => item.id));
    return {
      optionGroupId: link.optionGroup.id,
      name: link.overrideName || link.optionGroup.name,
      items: (selected?.items ?? []).filter((item) => availableItemIds.has(item.optionItemId)),
    };
  });
}
