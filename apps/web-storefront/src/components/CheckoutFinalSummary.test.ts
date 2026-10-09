import 'reflect-metadata';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentMethod, type CartLineItem } from '@gestor/types';
import { CheckoutFinalSummary } from './CheckoutFinalSummary';
import { getCheckoutItemDetails } from '../lib/checkout-summary';

describe('checkout final summary', () => {
  it('reflects variations, complements, combo slots and item notes from cart state', () => {
    const item: CartLineItem = {
      cartLineId: 'line-1',
      productId: 'product-1',
      quantity: 2,
      notes: 'Sem cebola',
      selections: [{
        optionGroupId: 'group-1',
        name: 'Adicionais',
        items: [{ optionItemId: 'option-1', name: 'Bacon', priceImpactType: 'fixed', priceImpactValue: 3, qty: 2 }],
      }],
      slots: [{
        blockId: 'block-1',
        productId: 'combo-1',
        comboSlotId: 'slot-1',
        items: [{ productId: 'drink-1', name: 'Refrigerante', additionalPrice: 0, qty: 1 }],
      }],
      snapshot: {
        productName: 'Hambúrguer',
        basePrice: 20,
        lineSubtotal: 46,
        extrasDescription: 'Ponto da carne: bem passado',
        items: [],
      },
    };

    expect(getCheckoutItemDetails(item)).toEqual([
      'Ponto da carne: bem passado',
      '2x Bacon',
      '1x Refrigerante',
    ]);
    expect(item.notes).toBe('Sem cebola');
  });

  it('renders the final payload-facing totals, fulfillment, address and payment details', () => {
    const item: CartLineItem = {
      cartLineId: 'line-1',
      productId: 'product-1',
      quantity: 1,
      snapshot: {
        productName: 'Produto',
        basePrice: 30,
        lineSubtotal: 30,
        extrasDescription: '',
        items: [],
      },
    };

    const html = renderToStaticMarkup(React.createElement(CheckoutFinalSummary, {
      items: [item],
      subtotal: 30,
      deliveryFee: 5,
      deliveryEstimatedMinutes: 40,
      discountTotal: 7,
      cashbackUsed: 2,
      couponCode: 'CUPOM',
      total: 28,
      fulfillmentType: 'delivery',
      payment: { method: PaymentMethod.cash, changeFor: 50 },
      addressSummary: 'Rua A, 10 · Centro',
      notes: 'Tocar a campainha',
      isValidating: false,
    }));

    expect(html).toContain('Confira seu pedido');
    expect(html).toContain('Taxa de entrega');
    expect(html).toContain('Cashback utilizado');
    expect(html).toContain('CUPOM');
    expect(html).toContain('Rua A, 10 · Centro');
    expect(html).toContain('Troco para');
    expect(html).toContain('Tocar a campainha');
  });
});
