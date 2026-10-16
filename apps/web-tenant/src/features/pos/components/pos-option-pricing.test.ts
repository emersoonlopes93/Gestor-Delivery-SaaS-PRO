import { describe, expect, it } from 'vitest';
import { computeOptionSelectionsPrice, getOptionSelectionsPricePreview, type PosOptionPricingProductDetail } from './pos-option-pricing';

const product: PosOptionPricingProductDetail = {
  basePrice: 12,
  optionGroupLinks: [
    { id: 'size-link', pricingAxis: 'primary', optionGroup: { id: 'size', name: 'Size', selectionType: 'single', isRequired: false, minSelect: 0, maxSelect: 1, isActive: true, items: [{ id: 'large', name: 'Large', isActive: true, allowQuantity: false, priceImpactType: 'replace', priceImpactValue: 15 }] } },
    { id: 'extra-link', pricingAxis: 'secondary', optionGroup: { id: 'extra', name: 'Extra', selectionType: 'multiple', isRequired: false, minSelect: 0, maxSelect: 2, isActive: true, items: [{ id: 'granola', name: 'Granola', isActive: true, allowQuantity: false, priceImpactType: 'fixed', priceImpactValue: 2 }, { id: 'fee', name: 'Fee', isActive: true, allowQuantity: false, priceImpactType: 'percentage', priceImpactValue: 10 }] } },
  ],
};

describe('POS canonical option pricing', () => {
  it('replaces base and applies fixed or percentage values independently of selection order', () => {
    expect(computeOptionSelectionsPrice(product, [{ optionGroupId: 'size', items: [{ optionItemId: 'large' }] }]).unitPrice).toBe(15);
    expect(computeOptionSelectionsPrice(product, [{ optionGroupId: 'size', items: [{ optionItemId: 'large' }] }, { optionGroupId: 'extra', items: [{ optionItemId: 'granola' }] }]).unitPrice).toBe(17);
    expect(computeOptionSelectionsPrice(product, [{ optionGroupId: 'extra', items: [{ optionItemId: 'fee' }] }, { optionGroupId: 'size', items: [{ optionItemId: 'large' }] }]).unitPrice).toBe(16.5);
  });

  it('uses an item override as the effective value without changing its impact type', () => {
    const overridden = { ...product, optionItemPrices: [{ optionItemId: 'granola', price: 3, isActive: true }] };
    expect(computeOptionSelectionsPrice(overridden, [{ optionGroupId: 'extra', items: [{ optionItemId: 'granola' }] }]).pricing.breakdown.fixed[0]?.priceImpactType).toBe('fixed');
    expect(computeOptionSelectionsPrice(overridden, [{ optionGroupId: 'extra', items: [{ optionItemId: 'granola' }] }]).unitPrice).toBe(15);
  });

  it('excludes inactive items and supports quantity limits', () => {
    const inactive = { ...product, optionGroupLinks: [{ ...product.optionGroupLinks![0], optionGroup: { ...product.optionGroupLinks![0]!.optionGroup, items: [{ ...product.optionGroupLinks![0]!.optionGroup.items[0]!, effectiveIsActive: false }] } }] };
    expect(getOptionSelectionsPricePreview(inactive, [{ optionGroupId: 'size', items: [{ optionItemId: 'large' }] }])).toBeNull();
  });
});
