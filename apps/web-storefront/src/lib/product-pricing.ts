import type { CartSelectedOptionGroup, StorefrontProductPayload } from '@gestor/types';

/**
 * Resolves the price displayed before a configurable product is opened.
 *
 * The public payload already excludes archived groups/items and exposes the
 * product-level effective availability and price overrides. Keeping this
 * derivation at the Storefront boundary prevents display-only pricing from
 * leaking into Checkout, which remains authoritative.
 */
export function getStorefrontStartingPrice(product: StorefrontProductPayload): number {
  const replacePrices = (product.optionGroupLinks ?? [])
    .filter((link) => link.pricingAxis === 'primary' && link.optionGroup.isActive)
    .flatMap((link) => link.optionGroup.items)
    .filter((item) => (
      item.isActive
      && item.effectiveIsActive !== false
      && item.priceImpactType === 'replace'
      && Number.isFinite(Number(item.priceImpactValue))
    ))
    .map((item) => Number(item.priceImpactValue));

  return replacePrices.length > 0 ? Math.min(...replacePrices) : product.basePrice;
}

export function hasStorefrontStartingPrice(product: StorefrontProductPayload): boolean {
  return (product.optionGroupLinks ?? []).some((link) =>
    link.pricingAxis === 'primary'
    && link.optionGroup.isActive
    && link.optionGroup.items.some((item) =>
      item.isActive
      && item.effectiveIsActive !== false
      && item.priceImpactType === 'replace'
      && Number.isFinite(Number(item.priceImpactValue)),
    ),
  );
}

/** Preview-only counterpart of Checkout's structural replace rule. Checkout remains authoritative. */
export function calculateStorefrontGenericUnitPrice(
  product: StorefrontProductPayload,
  selections: CartSelectedOptionGroup[],
): number {
  let effectiveBasePrice = product.basePrice;
  let extras = 0;

  for (const selection of selections) {
    const link = (product.optionGroupLinks ?? []).find((candidate) => candidate.optionGroup.id === selection.optionGroupId);
    if (!link) continue;

    for (const selected of selection.items) {
      const item = link.optionGroup.items.find((candidate) => candidate.id === selected.optionItemId);
      if (!item || !item.isActive || item.effectiveIsActive === false) continue;

      const impactValue = Number(item.priceImpactValue);
      if (link.pricingAxis === 'primary' && item.priceImpactType === 'replace') {
        effectiveBasePrice = impactValue;
      }
    }
  }

  for (const selection of selections) {
    const link = (product.optionGroupLinks ?? []).find((candidate) => candidate.optionGroup.id === selection.optionGroupId);
    if (!link) continue;

    for (const selected of selection.items) {
      const item = link.optionGroup.items.find((candidate) => candidate.id === selected.optionItemId);
      if (!item || !item.isActive || item.effectiveIsActive === false) continue;

      const qty = Math.max(1, Number(selected.qty ?? 1));
      const impactValue = Number(item.priceImpactValue);
      if (item.priceImpactType === 'fixed') extras += impactValue * qty;
      if (item.priceImpactType === 'percentage') extras += effectiveBasePrice * (impactValue / 100) * qty;
    }
  }

  return effectiveBasePrice + extras;
}
