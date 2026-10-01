import { describe, expect, it } from 'vitest';
import type { CartSelectedOptionGroup, StorefrontProductPayload } from '@gestor/types';
import {
  getStorefrontGenericOptionPricingPreview,
  getStorefrontStartingPrice,
  hasStorefrontStartingPrice,
  resolveStorefrontGenericOptionPricing,
  toStorefrontCatalogOptionPricingInput,
} from './product-pricing';

const baseProduct: StorefrontProductPayload = {
  id: 'acai',
  name: 'Açaí',
  slug: 'acai',
  basePrice: 12,
  isAvailable: true,
  optionGroupLinks: [],
  complementGroups: [],
  upsellLinks: [],
  badges: [],
};

function productWithOptions(...optionGroupLinks: StorefrontProductPayload['optionGroupLinks']): StorefrontProductPayload {
  return { ...baseProduct, optionGroupLinks };
}

const optionalReplace = {
  id: 'size-link',
  optionGroupId: 'size',
  order: 0,
  pricingAxis: 'primary',
  optionGroup: {
    id: 'size', name: 'Tamanho', selectionType: 'single' as const,
    isRequired: false, minSelect: 0, maxSelect: 1, isActive: true,
    items: [{
      id: 'large', name: '500 ml', isActive: true, effectiveIsActive: true,
      allowQuantity: false, priceImpactType: 'replace' as const, priceImpactValue: 15,
    }],
  },
} satisfies StorefrontProductPayload['optionGroupLinks'][number];

const fixedExtra = {
  id: 'extra-link',
  optionGroupId: 'extra',
  order: 1,
  pricingAxis: 'secondary',
  optionGroup: {
    id: 'extra', name: 'Granola', selectionType: 'multiple' as const,
    isRequired: false, minSelect: 0, maxSelect: 2, isActive: true,
    items: [{
      id: 'granola', name: 'Granola', isActive: true, effectiveIsActive: true,
      allowQuantity: false, priceImpactType: 'fixed' as const, priceImpactValue: 2,
    }],
  },
} satisfies StorefrontProductPayload['optionGroupLinks'][number];

function selected(optionGroupId: string, optionItemId: string, qty = 1): CartSelectedOptionGroup {
  return {
    optionGroupId,
    name: optionGroupId,
    items: [{ optionItemId, name: optionItemId, priceImpactType: 'none', priceImpactValue: 0, qty }],
  };
}

describe('Storefront canonical starting price', () => {
  it('keeps the base for an optional primary replace', () => {
    const product = productWithOptions(optionalReplace);
    expect(getStorefrontStartingPrice(product)).toBe(12);
    expect(hasStorefrontStartingPrice(product)).toBe(true);
  });

  it('uses a required primary replace and a required secondary fixed option', () => {
    const requiredReplace = {
      ...optionalReplace,
      optionGroup: { ...optionalReplace.optionGroup, isRequired: true, minSelect: 1 },
    };
    const requiredFixed = {
      ...fixedExtra,
      optionGroup: { ...fixedExtra.optionGroup, isRequired: true, minSelect: 1 },
    };

    expect(getStorefrontStartingPrice(productWithOptions(requiredReplace))).toBe(15);
    expect(getStorefrontStartingPrice(productWithOptions(requiredFixed))).toBe(14);
  });

  it('returns null when a required group has no effectively active item', () => {
    const unavailable = {
      ...optionalReplace,
      optionGroup: {
        ...optionalReplace.optionGroup,
        isRequired: true,
        minSelect: 1,
        items: [{ ...optionalReplace.optionGroup.items[0], effectiveIsActive: false }],
      },
    };
    expect(getStorefrontStartingPrice(productWithOptions(unavailable))).toBeNull();
  });
});

describe('Storefront canonical generic preview', () => {
  it('replaces base 12 with 15 and applies a fixed extra after replacement', () => {
    const result = resolveStorefrontGenericOptionPricing(
      productWithOptions(optionalReplace, fixedExtra),
      [selected('size', 'large'), selected('extra', 'granola')],
    );
    expect(result.effectiveBasePriceCents).toBe(1500);
    expect(result.unitPriceCents).toBe(1700);
  });

  it('applies percentage on the replaced base independently of selection order', () => {
    const percentage = {
      id: 'fee-link', optionGroupId: 'fee', order: 2, pricingAxis: 'secondary',
      optionGroup: {
        id: 'fee', name: 'Taxa', selectionType: 'multiple' as const,
        isRequired: false, minSelect: 0, maxSelect: 1, isActive: true,
        items: [{
          id: 'service', name: 'Serviço', isActive: true, effectiveIsActive: true,
          allowQuantity: false, priceImpactType: 'percentage' as const, priceImpactValue: 10,
        }],
      },
    } satisfies StorefrontProductPayload['optionGroupLinks'][number];
    const product = productWithOptions(optionalReplace, percentage);
    const forward = resolveStorefrontGenericOptionPricing(product, [selected('size', 'large'), selected('fee', 'service')]);
    const reverse = resolveStorefrontGenericOptionPricing(product, [selected('fee', 'service'), selected('size', 'large')]);

    expect(forward.unitPriceCents).toBe(1650);
    expect(reverse.unitPriceCents).toBe(1650);
    expect(toStorefrontCatalogOptionPricingInput(product).optionGroups[1]?.items[0]?.priceImpactBasisPoints).toBe(1000);
  });

  it('preserves quantity semantics and rejects inactive selected items from the preview', () => {
    const quantity = {
      id: 'quantity-link', optionGroupId: 'quantity', order: 3, pricingAxis: 'secondary',
      optionGroup: {
        id: 'quantity', name: 'Extras', selectionType: 'quantity' as const,
        isRequired: false, minSelect: 0, maxSelect: 1, isActive: true,
        items: [{
          id: 'milk', name: 'Leite', isActive: true, effectiveIsActive: true,
          allowQuantity: true, minQty: 1, maxQty: 3, priceImpactType: 'fixed' as const, priceImpactValue: 2,
        }],
      },
    } satisfies StorefrontProductPayload['optionGroupLinks'][number];
    expect(resolveStorefrontGenericOptionPricing(productWithOptions(quantity), [selected('quantity', 'milk', 2)]).unitPriceCents).toBe(1600);

    const unavailable = productWithOptions({
      ...optionalReplace,
      optionGroup: { ...optionalReplace.optionGroup, items: [{ ...optionalReplace.optionGroup.items[0], effectiveIsActive: false }] },
    });
    expect(getStorefrontGenericOptionPricingPreview(unavailable, [selected('size', 'large')])).toBeNull();
  });
});
