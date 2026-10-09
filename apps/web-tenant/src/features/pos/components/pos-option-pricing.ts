import {
  CatalogPricingValidationError,
  resolveCatalogOptionPricing,
} from '@gestor/pricing';
import type {
  CatalogOptionGroup,
  CatalogOptionPricingInput,
  CatalogOptionSelection,
  CatalogPricingResult,
  PriceImpactType,
} from '@gestor/pricing';
import { resolveEffectiveSelectionRules } from '@gestor/types';

type PricingAxis = 'primary' | 'secondary';

export type PosOptionPricingProductDetail = {
  basePrice: number;
  optionItemPrices?: Array<{
    optionItemId: string;
    price?: number | null;
    isActive?: boolean | null;
  }>;
  optionGroupLinks?: Array<{
    id: string;
    pricingAxis?: PricingAxis;
    overrideName?: string | null;
    overrideIsRequired?: boolean | null;
    overrideMinSelect?: number | null;
    overrideMaxSelect?: number | null;
    optionGroup: {
      id: string;
      name: string;
      selectionType: 'single' | 'multiple' | 'quantity';
      isRequired: boolean;
      minSelect: number;
      maxSelect: number;
      isActive: boolean;
      items: Array<{
        id: string;
        name: string;
        isActive: boolean;
        effectiveIsActive?: boolean;
        allowQuantity: boolean;
        minQty?: number | null;
        maxQty?: number | null;
        priceImpactType: PriceImpactType;
        priceImpactValue: number;
      }>;
    };
  }>;
};

export type PosOptionSelectionState = Array<{
  optionGroupId: string;
  items: Array<{ optionItemId: string; qty?: number }>;
}>;

export type PosOptionPricingPreview = {
  unitPrice: number;
  composition: string;
  pricing: CatalogPricingResult;
};

function decimalToCents(value: number): number {
  return Math.round(value * 100);
}

function percentageToBasisPoints(value: number): number {
  return Math.round(value * 100);
}

function toCanonicalPricingInput(
  detail: PosOptionPricingProductDetail,
  selections: PosOptionSelectionState,
): CatalogOptionPricingInput {
  const overrides = new Map((detail.optionItemPrices ?? []).map((override) => [override.optionItemId, override]));
  const optionGroups = (detail.optionGroupLinks ?? []).map((link): CatalogOptionGroup => {
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
      items: group.items.map((item) => {
        const override = overrides.get(item.id);
        const effectiveValue = override?.price ?? item.priceImpactValue;
        return {
          id: item.id,
          isActive: item.isActive,
          effectiveIsActive: item.effectiveIsActive ?? (item.isActive && (override?.isActive ?? true)),
          allowQuantity: item.allowQuantity,
          minQty: item.minQty ?? undefined,
          maxQty: item.maxQty ?? undefined,
          priceImpactType: item.priceImpactType,
          priceImpactValueCents: item.priceImpactType === 'fixed' || item.priceImpactType === 'replace'
            ? decimalToCents(effectiveValue)
            : undefined,
          priceImpactBasisPoints: item.priceImpactType === 'percentage'
            ? percentageToBasisPoints(effectiveValue)
            : undefined,
        };
      }),
    };
  });

  const canonicalSelections: CatalogOptionSelection[] = selections
    .filter((selection) => selection.items.length > 0)
    .map((selection) => ({
      optionGroupId: selection.optionGroupId,
      items: selection.items.map((item) => ({ optionItemId: item.optionItemId, qty: item.qty ?? 1 })),
    }));

  return {
    basePriceCents: decimalToCents(detail.basePrice),
    optionGroups,
    selections: canonicalSelections,
  };
}

function buildComposition(detail: PosOptionPricingProductDetail, selections: PosOptionSelectionState): string {
  const links = new Map((detail.optionGroupLinks ?? []).map((link) => [link.optionGroup.id, link]));
  const parts: string[] = [];
  for (const selection of selections) {
    const link = links.get(selection.optionGroupId);
    if (!link || selection.items.length === 0) continue;
    const names = selection.items.map((selected) => {
      const item = link.optionGroup.items.find((candidate) => candidate.id === selected.optionItemId);
      if (!item) return selected.optionItemId;
      const qty = selected.qty ?? 1;
      return item.allowQuantity && qty > 1 ? `${item.name} x${qty}` : item.name;
    });
    parts.push(`${link.overrideName ?? link.optionGroup.name}: ${names.join(', ')}`);
  }
  return parts.join('; ');
}

/** POS preview only. The Checkout remains the server-side pricing authority. */
export function computeOptionSelectionsPrice(
  detail: PosOptionPricingProductDetail,
  selections: PosOptionSelectionState,
): PosOptionPricingPreview {
  const pricing = resolveCatalogOptionPricing(toCanonicalPricingInput(detail, selections));
  return {
    unitPrice: pricing.unitPriceCents / 100,
    composition: buildComposition(detail, selections),
    pricing,
  };
}

/** Keeps the POS preview stable while existing inline validation reports an incomplete selection. */
export function getOptionSelectionsPricePreview(
  detail: PosOptionPricingProductDetail,
  selections: PosOptionSelectionState,
): PosOptionPricingPreview | null {
  try {
    return computeOptionSelectionsPrice(detail, selections);
  } catch (error: unknown) {
    if (error instanceof CatalogPricingValidationError) return null;
    throw error;
  }
}
