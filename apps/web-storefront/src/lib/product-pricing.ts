import {
  CatalogPricingValidationError,
  getCatalogStartingPrice,
  resolveCatalogOptionPricing,
} from '@gestor/pricing';
import type {
  CatalogOptionGroup,
  CatalogOptionPricingInput,
  CatalogOptionSelection,
  CatalogPricingResult,
} from '@gestor/pricing';
import {
  resolveEffectiveSelectionRules,
  type CartSelectedOptionGroup,
  type StorefrontProductPayload,
} from '@gestor/types';

type StorefrontOptionGroupLink = NonNullable<StorefrontProductPayload['optionGroupLinks']>[number];

function decimalToCents(value: number): number {
  return Math.round(value * 100);
}

function percentageToBasisPoints(value: number): number {
  return Math.round(value * 100);
}

function toCanonicalGroup(link: StorefrontOptionGroupLink): CatalogOptionGroup {
  const group = link.optionGroup;
  const rules = resolveEffectiveSelectionRules({
    selectionType: group.selectionType,
    isRequired: group.isRequired,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    overrideIsRequired: link.overrideIsRequired,
    overrideMinSelect: link.overrideMinSelect,
    overrideMaxSelect: link.overrideMaxSelect,
  });

  return {
    id: group.id,
    selectionType: group.selectionType,
    pricingAxis: link.pricingAxis === 'primary' ? 'primary' : 'secondary',
    isActive: group.isActive,
    isRequired: rules.effectiveIsRequired,
    minSelect: rules.effectiveMinSelect,
    maxSelect: rules.effectiveMaxSelect,
    items: group.items.map((item) => ({
      id: item.id,
      isActive: item.isActive,
      effectiveIsActive: item.effectiveIsActive,
      allowQuantity: item.allowQuantity,
      minQty: item.minQty ?? undefined,
      maxQty: item.maxQty ?? undefined,
      priceImpactType: item.priceImpactType,
      priceImpactValueCents: item.priceImpactType === 'fixed' || item.priceImpactType === 'replace'
        ? decimalToCents(item.priceImpactValue)
        : undefined,
      priceImpactBasisPoints: item.priceImpactType === 'percentage'
        ? percentageToBasisPoints(item.priceImpactValue)
        : undefined,
    })),
  };
}

function toCanonicalSelections(selections: CartSelectedOptionGroup[]): CatalogOptionSelection[] {
  return selections
    .filter((selection) => selection.items.length > 0)
    .map((selection) => ({
      optionGroupId: selection.optionGroupId,
      items: selection.items.map((item) => ({
        optionItemId: item.optionItemId,
        qty: item.qty ?? 1,
      })),
    }));
}

/** Adapts the effective public catalog payload to the pure pricing contract. */
export function toStorefrontCatalogOptionPricingInput(
  product: StorefrontProductPayload,
  selections: CartSelectedOptionGroup[] = [],
  optionGroupLinks: StorefrontOptionGroupLink[] = product.optionGroupLinks ?? [],
): CatalogOptionPricingInput {
  return {
    basePriceCents: decimalToCents(product.basePrice),
    optionGroups: optionGroupLinks.map(toCanonicalGroup),
    selections: toCanonicalSelections(selections),
  };
}

/** Preview only. Checkout remains the authority for persisted order pricing. */
export function resolveStorefrontGenericOptionPricing(
  product: StorefrontProductPayload,
  selections: CartSelectedOptionGroup[],
  optionGroupLinks: StorefrontOptionGroupLink[] = product.optionGroupLinks ?? [],
): CatalogPricingResult {
  return resolveCatalogOptionPricing(
    toStorefrontCatalogOptionPricingInput(product, selections, optionGroupLinks),
  );
}

/** Invalid in-progress selections keep the preview at its base until inline validation completes. */
export function getStorefrontGenericOptionPricingPreview(
  product: StorefrontProductPayload,
  selections: CartSelectedOptionGroup[],
  optionGroupLinks: StorefrontOptionGroupLink[] = product.optionGroupLinks ?? [],
): CatalogPricingResult | null {
  try {
    return resolveStorefrontGenericOptionPricing(product, selections, optionGroupLinks);
  } catch (error: unknown) {
    if (error instanceof CatalogPricingValidationError) return null;
    throw error;
  }
}

/** Returns null when the public configuration has no valid minimum selection. */
export function getStorefrontStartingPrice(product: StorefrontProductPayload): number | null {
  try {
    const startingPriceCents = getCatalogStartingPrice(
      toStorefrontCatalogOptionPricingInput(product),
    );
    return startingPriceCents === null ? null : startingPriceCents / 100;
  } catch (error: unknown) {
    if (error instanceof CatalogPricingValidationError) return null;
    throw error;
  }
}

export function hasStorefrontStartingPrice(product: StorefrontProductPayload): boolean {
  return (product.optionGroupLinks ?? []).some((link) => link.optionGroup.isActive)
    && getStorefrontStartingPrice(product) !== null;
}
