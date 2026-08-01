import type { StorefrontProductPayload } from '@gestor/types';
import type { StorefrontShowcaseSettings } from '@gestor/theme';

type ResolveStorefrontShowcaseInput = {
  settings: StorefrontShowcaseSettings;
  eligibleProducts: ReadonlyMap<string, StorefrontProductPayload>;
  bestSellingProductIds: readonly string[];
};

export function resolveStorefrontShowcase({
  settings,
  eligibleProducts,
  bestSellingProductIds,
}: ResolveStorefrontShowcaseInput): StorefrontProductPayload[] {
  if (!settings.enabled) return [];

  const selected: StorefrontProductPayload[] = [];
  const selectedIds = new Set<string>();
  const append = (product: StorefrontProductPayload | undefined) => {
    if (!product || selectedIds.has(product.id) || selected.length >= settings.maxItems) return;
    selectedIds.add(product.id);
    selected.push(product);
  };

  if (settings.mode === 'manual' || settings.mode === 'hybrid') {
    settings.manualProductIds.forEach((id) => append(eligibleProducts.get(id)));
  }

  if (settings.mode === 'automatic' || settings.mode === 'hybrid') {
    if (settings.automaticStrategy === 'best_selling') {
      bestSellingProductIds.forEach((id) => append(eligibleProducts.get(id)));
    }

    if (settings.automaticStrategy === 'promotions') {
      eligibleProducts.forEach((product) => {
        if (product.badges.some((badge) => badge.id === 'promotion')) append(product);
      });
    }
  }

  return selected;
}
