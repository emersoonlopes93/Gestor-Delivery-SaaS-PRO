import { describe, expect, it } from 'vitest';
import {
  CatalogPricingValidationError,
  getCatalogStartingPrice,
  resolveCatalogOptionPricing,
} from './catalog-pricing';
import type { CatalogOptionGroup, CatalogOptionPricingInput } from './catalog-pricing';

function item(id: string, overrides: Partial<CatalogOptionGroup['items'][number]> = {}) {
  return {
    id,
    isActive: true,
    allowQuantity: false,
    priceImpactType: 'none' as const,
    ...overrides,
  };
}

function group(id: string, overrides: Partial<CatalogOptionGroup> = {}): CatalogOptionGroup {
  return {
    id,
    selectionType: 'single',
    pricingAxis: 'secondary',
    isRequired: false,
    items: [],
    ...overrides,
  };
}

function pricingInput(overrides: Partial<CatalogOptionPricingInput> = {}): CatalogOptionPricingInput {
  return { basePriceCents: 1200, optionGroups: [], selections: [], ...overrides };
}

describe('resolveCatalogOptionPricing', () => {
  it('keeps a base price with no selections', () => {
    const result = resolveCatalogOptionPricing(pricingInput());
    expect(result.unitPriceCents).toBe(1200);
    expect(result.startingPriceCents).toBe(1200);
  });

  it('adds fixed values after the base price', () => {
    const extras = group('extras', {
      selectionType: 'multiple',
      items: [item('granola', { priceImpactType: 'fixed', priceImpactValueCents: 200 })],
    });
    expect(resolveCatalogOptionPricing(pricingInput({ optionGroups: [extras], selections: [{ optionGroupId: 'extras', items: [{ optionItemId: 'granola', qty: 1 }] }] })).unitPriceCents).toBe(1400);
  });

  it('replaces the base and adds fixed values after replacement', () => {
    const size = group('size', { pricingAxis: 'primary', items: [item('large', { priceImpactType: 'replace', priceImpactValueCents: 1500 })] });
    const extras = group('extras', { selectionType: 'multiple', items: [item('granola', { priceImpactType: 'fixed', priceImpactValueCents: 200 })] });
    expect(resolveCatalogOptionPricing(pricingInput({
      optionGroups: [size],
      selections: [{ optionGroupId: 'size', items: [{ optionItemId: 'large', qty: 1 }] }],
    })).unitPriceCents).toBe(1500);
    const result = resolveCatalogOptionPricing(pricingInput({
      optionGroups: [size, extras],
      selections: [
        { optionGroupId: 'size', items: [{ optionItemId: 'large', qty: 1 }] },
        { optionGroupId: 'extras', items: [{ optionItemId: 'granola', qty: 1 }] },
      ],
    }));
    expect(result.effectiveBasePriceCents).toBe(1500);
    expect(result.unitPriceCents).toBe(1700);
  });

  it('uses an override as the effective value without changing the impact type', () => {
    const extras = group('extras', {
      selectionType: 'multiple',
      items: [item('granola', {
        priceImpactType: 'fixed',
        priceImpactValueCents: 200,
        effectivePriceImpactValueCents: 300,
      })],
    });
    const result = resolveCatalogOptionPricing(pricingInput({
      optionGroups: [extras],
      selections: [{ optionGroupId: 'extras', items: [{ optionItemId: 'granola', qty: 1 }] }],
    }));
    expect(result.fixedTotalCents).toBe(300);
    expect(result.breakdown.fixed[0]?.priceImpactType).toBe('fixed');
  });

  it('calculates percentages on the replaced base regardless of payload order', () => {
    const size = group('size', { pricingAxis: 'primary', items: [item('large', { priceImpactType: 'replace', priceImpactValueCents: 1500 })] });
    const fee = group('fee', { selectionType: 'multiple', items: [item('service', { priceImpactType: 'percentage', priceImpactBasisPoints: 1000 })] });
    const selections = [
      { optionGroupId: 'fee', items: [{ optionItemId: 'service', qty: 1 }] },
      { optionGroupId: 'size', items: [{ optionItemId: 'large', qty: 1 }] },
    ];
    expect(resolveCatalogOptionPricing(pricingInput({ optionGroups: [size, fee], selections })).unitPriceCents).toBe(1650);
    expect(resolveCatalogOptionPricing(pricingInput({ optionGroups: [size, fee], selections: [...selections].reverse() })).unitPriceCents).toBe(1650);
  });

  it('applies HALF_UP percentage rounding per item before quantity', () => {
    const fee = group('fee', { selectionType: 'quantity', items: [item('service', { allowQuantity: true, priceImpactType: 'percentage', priceImpactBasisPoints: 3333 })] });
    const result = resolveCatalogOptionPricing(pricingInput({ optionGroups: [fee], selections: [{ optionGroupId: 'fee', items: [{ optionItemId: 'service', qty: 2 }] }] }));
    expect(result.percentageTotalCents).toBe(800);
  });

  it('rejects invalid selection quantities and duplicate selections', () => {
    const replace = group('size', { pricingAxis: 'primary', selectionType: 'quantity', items: [item('large', { allowQuantity: true, priceImpactType: 'replace', priceImpactValueCents: 1500 })] });
    const multiple = group('extras', { selectionType: 'multiple', items: [item('granola', { allowQuantity: true, priceImpactType: 'fixed', priceImpactValueCents: 100 })] });
    const disabledQuantity = group('syrup', { selectionType: 'quantity', items: [item('chocolate', { priceImpactType: 'fixed', priceImpactValueCents: 100 })] });
    expect(() => resolveCatalogOptionPricing(pricingInput({ optionGroups: [replace], selections: [{ optionGroupId: 'size', items: [{ optionItemId: 'large', qty: 2 }] }] }))).toThrow(CatalogPricingValidationError);
    expect(() => resolveCatalogOptionPricing(pricingInput({ optionGroups: [multiple], selections: [{ optionGroupId: 'extras', items: [{ optionItemId: 'granola', qty: 2 }] }] }))).toThrow(CatalogPricingValidationError);
    expect(() => resolveCatalogOptionPricing(pricingInput({ optionGroups: [disabledQuantity], selections: [{ optionGroupId: 'syrup', items: [{ optionItemId: 'chocolate', qty: 2 }] }] }))).toThrow(CatalogPricingValidationError);
  });

  it('counts minSelect as distinct item ids while minQty constrains each item', () => {
    const toppings = group('toppings', {
      selectionType: 'quantity', isRequired: true, minSelect: 3, maxSelect: 3,
      items: [
        item('one', { allowQuantity: true }), item('two', { allowQuantity: true }), item('three', { allowQuantity: true }),
      ],
    });
    expect(() => resolveCatalogOptionPricing(pricingInput({ optionGroups: [toppings], selections: [{ optionGroupId: 'toppings', items: [{ optionItemId: 'one', qty: 3 }] }] }))).toThrow(CatalogPricingValidationError);
    expect(resolveCatalogOptionPricing(pricingInput({ optionGroups: [toppings], selections: [{ optionGroupId: 'toppings', items: [{ optionItemId: 'one', qty: 1 }, { optionItemId: 'two', qty: 1 }, { optionItemId: 'three', qty: 1 }] }] })).unitPriceCents).toBe(1200);

    const minimumQuantity = group('minimum-quantity', { selectionType: 'quantity', isRequired: true, minSelect: 1, items: [item('one', { allowQuantity: true, minQty: 3 })] });
    expect(resolveCatalogOptionPricing(pricingInput({ optionGroups: [minimumQuantity], selections: [{ optionGroupId: 'minimum-quantity', items: [{ optionItemId: 'one', qty: 3 }] }] })).unitPriceCents).toBe(1200);
  });
});

describe('getCatalogStartingPrice', () => {
  it('keeps the base when a primary replace group is optional', () => {
    const size = group('size', { pricingAxis: 'primary', items: [item('large', { priceImpactType: 'replace', priceImpactValueCents: 1500 })] });
    expect(getCatalogStartingPrice(pricingInput({ optionGroups: [size] }))).toBe(1200);
  });

  it('uses a replace for a required primary group and required secondary fixed cost', () => {
    const size = group('size', { pricingAxis: 'primary', isRequired: true, items: [item('large', { priceImpactType: 'replace', priceImpactValueCents: 1500 })] });
    expect(getCatalogStartingPrice(pricingInput({ optionGroups: [size] }))).toBe(1500);

    const extra = group('extra', { selectionType: 'multiple', isRequired: true, items: [item('granola', { priceImpactType: 'fixed', priceImpactValueCents: 200 })] });
    expect(getCatalogStartingPrice(pricingInput({ optionGroups: [extra] }))).toBe(1400);
  });

  it('returns null when no valid minimum configuration exists', () => {
    const impossible = group('impossible', {
      isRequired: true,
      items: [item('archived', { isActive: false })],
    });
    expect(getCatalogStartingPrice(pricingInput({ optionGroups: [impossible] }))).toBeNull();
  });
});
