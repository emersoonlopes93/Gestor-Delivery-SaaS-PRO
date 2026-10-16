import type { CartLineItem } from '@gestor/types';

export function getCheckoutItemDetails(item: CartLineItem): string[] {
  const details = new Set<string>();
  const extrasDescription = item.snapshot.extrasDescription?.trim();
  if (extrasDescription) details.add(extrasDescription);

  for (const group of item.selections ?? []) {
    for (const option of group.items) {
      details.add(`${option.qty || 1}x ${option.name}`);
    }
  }

  for (const slot of item.slots ?? []) {
    for (const slotItem of slot.items ?? []) {
      details.add(`${slotItem.qty || 1}x ${slotItem.name}`);
    }
  }

  if (item.pizzaComposition?.sizeName) {
    details.add(`Tamanho: ${item.pizzaComposition.sizeName}`);
  }
  for (const flavor of item.pizzaComposition?.flavors ?? []) {
    if (flavor.name) details.add(flavor.name);
  }

  return Array.from(details);
}
