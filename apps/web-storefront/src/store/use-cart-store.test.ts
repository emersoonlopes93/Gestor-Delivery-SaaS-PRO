import { beforeEach, describe, expect, it } from 'vitest';
import type { CartSelectedOptionGroup, StorefrontProductPayload } from '@gestor/types';
import { useCartStore } from './use-cart-store';

const product: StorefrontProductPayload = {
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

const replaceSelection: CartSelectedOptionGroup = {
  optionGroupId: 'size',
  name: 'Tamanho',
  items: [{
    optionItemId: '330ml',
    name: '330 ml',
    priceImpactType: 'replace',
    priceImpactValue: 15,
    qty: 1,
  }],
};

const fixedSelection: CartSelectedOptionGroup = {
  optionGroupId: 'extra',
  name: 'Complementos',
  items: [{
    optionItemId: 'granola',
    name: 'Granola',
    priceImpactType: 'fixed',
    priceImpactValue: 2,
    qty: 1,
  }],
};

const percentageSelection: CartSelectedOptionGroup = {
  optionGroupId: 'percentage',
  name: 'Cobertura',
  items: [{
    optionItemId: 'calda',
    name: 'Calda',
    priceImpactType: 'percentage',
    priceImpactValue: 10,
    qty: 1,
  }],
};

describe('useCartStore.updateQuantity', () => {
  beforeEach(() => {
    useCartStore.setState({
      tenantId: null,
      tenantSlug: null,
      tableId: null,
      items: [],
      subtotal: 0,
    });
  });

  function addConfiguredItem(computedUnitPrice: number, selections: CartSelectedOptionGroup[]) {
    useCartStore.getState().addItem({
      product,
      quantity: 1,
      selections,
      computedUnitPrice,
      compositionLabel: '',
    });
    return useCartStore.getState().items[0].cartLineId;
  }

  it('preserves a primary replace price after quantity changes', () => {
    const cartLineId = addConfiguredItem(15, [replaceSelection]);

    useCartStore.getState().updateQuantity(cartLineId, 2);

    expect(useCartStore.getState().items[0].snapshot.lineSubtotal).toBe(30);
  });

  it('preserves replace plus fixed extras after quantity changes', () => {
    const cartLineId = addConfiguredItem(17, [replaceSelection, fixedSelection]);

    useCartStore.getState().updateQuantity(cartLineId, 3);

    expect(useCartStore.getState().items[0].snapshot.lineSubtotal).toBe(51);
  });

  it('preserves the effective replace base used by percentage pricing', () => {
    const cartLineId = addConfiguredItem(16.5, [replaceSelection, percentageSelection]);

    useCartStore.getState().updateQuantity(cartLineId, 2);

    expect(useCartStore.getState().items[0].snapshot.lineSubtotal).toBe(33);
  });
});
