import type { StorefrontProductPayload } from '@gestor/types';

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
  return getStorefrontStartingPrice(product) !== product.basePrice;
}
