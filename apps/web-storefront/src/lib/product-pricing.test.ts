import { describe, expect, it } from 'vitest';
import type { StorefrontProductPayload } from '@gestor/types';
import { calculateStorefrontGenericUnitPrice, getStorefrontStartingPrice, hasStorefrontStartingPrice } from './product-pricing';

const baseProduct: StorefrontProductPayload = {
  id: 'acai',
  name: 'Açai',
  slug: 'acai',
  basePrice: 12,
  isAvailable: true,
  optionGroupLinks: [],
  complementGroups: [],
  upsellLinks: [],
  badges: [],
};

describe('getStorefrontStartingPrice', () => {
  it('uses the active effective primary replace price supplied by the product override', () => {
    const product: StorefrontProductPayload = {
      ...baseProduct,
      optionGroupLinks: [{
        id: 'size-link',
        optionGroupId: 'size',
        order: 0,
        pricingAxis: 'primary',
        optionGroup: {
          id: 'size',
          name: 'Tamanho',
          selectionType: 'single',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          isActive: true,
          items: [{
            id: 'small',
            name: 'Pequeno',
            isActive: true,
            effectiveIsActive: true,
            allowQuantity: false,
            priceImpactType: 'replace',
            priceImpactValue: 15,
          }],
        },
      }],
    };

    expect(getStorefrontStartingPrice(product)).toBe(15);
    expect(hasStorefrontStartingPrice(product)).toBe(true);
  });

  it('ignores inactive and non-primary replace options and preserves the product price', () => {
    const product: StorefrontProductPayload = {
      ...baseProduct,
      optionGroupLinks: [{
        id: 'extra-link',
        optionGroupId: 'extra',
        order: 0,
        pricingAxis: 'secondary',
        optionGroup: {
          id: 'extra',
          name: 'Extras',
          selectionType: 'multiple',
          isRequired: false,
          minSelect: 0,
          maxSelect: 2,
          isActive: true,
          items: [{
            id: 'inactive',
            name: 'Indisponível',
            isActive: true,
            effectiveIsActive: false,
            allowQuantity: false,
            priceImpactType: 'replace',
            priceImpactValue: 8,
          }],
        },
      }],
    };

    expect(getStorefrontStartingPrice(product)).toBe(12);
    expect(hasStorefrontStartingPrice(product)).toBe(false);
  });
});

describe('calculateStorefrontGenericUnitPrice', () => {
  const product: StorefrontProductPayload = {
    ...baseProduct,
    optionGroupLinks: [
      {
        id: 'size-link', optionGroupId: 'size', order: 0, pricingAxis: 'primary',
        optionGroup: { id: 'size', name: 'Volume', selectionType: 'single', isRequired: false, minSelect: 0, maxSelect: 1, isActive: true, items: [{ id: 'small', name: '330 ml', isActive: true, allowQuantity: false, priceImpactType: 'replace', priceImpactValue: 15 }] },
      },
      {
        id: 'extra-link', optionGroupId: 'extra', order: 1, pricingAxis: 'secondary',
        optionGroup: { id: 'extra', name: 'Adicionais', selectionType: 'multiple', isRequired: false, minSelect: 0, maxSelect: 2, isActive: true, items: [{ id: 'granola', name: 'Granola', isActive: true, allowQuantity: false, priceImpactType: 'fixed', priceImpactValue: 2 }] },
      },
    ],
  };

  it('replaces base 12 with primary replace 15 and adds fixed extras afterwards', () => {
    expect(calculateStorefrontGenericUnitPrice(product, [{ optionGroupId: 'size', name: 'Volume', items: [{ optionItemId: 'small', name: '330 ml', priceImpactType: 'replace', priceImpactValue: 15, qty: 1 }] }])).toBe(15);
    expect(calculateStorefrontGenericUnitPrice(product, [
      { optionGroupId: 'size', name: 'Volume', items: [{ optionItemId: 'small', name: '330 ml', priceImpactType: 'replace', priceImpactValue: 15, qty: 1 }] },
      { optionGroupId: 'extra', name: 'Adicionais', items: [{ optionItemId: 'granola', name: 'Granola', priceImpactType: 'fixed', priceImpactValue: 2, qty: 1 }] },
    ])).toBe(17);
    expect(calculateStorefrontGenericUnitPrice(product, [{ optionGroupId: 'extra', name: 'Adicionais', items: [{ optionItemId: 'granola', name: 'Granola', priceImpactType: 'fixed', priceImpactValue: 2, qty: 1 }] }])).toBe(14);
  });
});
