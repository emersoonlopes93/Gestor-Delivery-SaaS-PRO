import { describe, expect, it } from 'vitest';
import {
  getAdjacentCheckoutStep,
  getCheckoutStepError,
  getCheckoutSteps,
  type CheckoutStepValidationContext,
} from './checkout-flow';

const validContext: CheckoutStepValidationContext = {
  contactValid: true,
  fulfillmentValid: true,
  addressValid: true,
  addressQuoteCurrent: true,
  addressValidationPending: false,
  addressValidationError: false,
  paymentValid: true,
  schedulingValid: true,
  orderValid: true,
};

describe('checkout guided flow', () => {
  it('includes the address step for delivery', () => {
    expect(getCheckoutSteps('delivery', false).map((step) => step.id)).toEqual([
      'contact', 'fulfillment', 'address', 'payment', 'review',
    ]);
  });

  it('skips the address step for pickup', () => {
    expect(getCheckoutSteps('pickup', false).map((step) => step.id)).toEqual([
      'contact', 'fulfillment', 'payment', 'review',
    ]);
  });

  it('skips fulfillment and address for an identified table', () => {
    expect(getCheckoutSteps('table', true).map((step) => step.id)).toEqual([
      'contact', 'payment', 'review',
    ]);
  });

  it('preserves navigation position when moving back and forward', () => {
    const steps = getCheckoutSteps('delivery', false);
    // Deve permitir avançar de contact -> fulfillment
    expect(getAdjacentCheckoutStep(steps, 'contact', 'next')).toBe('fulfillment');
    // Deve permitir avançar de fulfillment -> address
    expect(getAdjacentCheckoutStep(steps, 'fulfillment', 'next')).toBe('address');
    // Deve permitir voltar de address -> fulfillment (Testando back na etapa 3 -> 2)
    expect(getAdjacentCheckoutStep(steps, 'address', 'back')).toBe('fulfillment');
    // Deve permitir voltar de fulfillment -> contact (Testando back na etapa 2 -> 1)
    expect(getAdjacentCheckoutStep(steps, 'fulfillment', 'back')).toBe('contact');
  });

  it('preserves correct steps for CTA rendering context across all modes', () => {
    // Delivery: CTA na Etapa 1, 2, 3, 4, CTA final na 5
    const deliverySteps = getCheckoutSteps('delivery', false).map(s => s.id);
    expect(deliverySteps.indexOf('review')).toBe(4); // 5ª etapa

    // Pickup: CTA na Etapa 1, 2, 3, CTA final na 4
    const pickupSteps = getCheckoutSteps('pickup', false).map(s => s.id);
    expect(pickupSteps.indexOf('review')).toBe(3); // 4ª etapa
    expect(pickupSteps).not.toContain('address'); // O CTA de endereço não renderiza

    // Table: CTA na Etapa 1, 2, CTA final na 3
    const tableSteps = getCheckoutSteps('table', true).map(s => s.id);
    expect(tableSteps.indexOf('review')).toBe(2); // 3ª etapa
    expect(tableSteps).not.toContain('fulfillment');
    expect(tableSteps).not.toContain('address');
  });

  it('blocks invalid contact data', () => {
    expect(getCheckoutStepError('contact', { ...validContext, contactValid: false })).toContain('nome');
  });

  it('blocks an incomplete delivery address', () => {
    expect(getCheckoutStepError('address', { ...validContext, addressValid: false })).toContain('endereço');
  });

  it('blocks while coverage validation is pending', () => {
    expect(getCheckoutStepError('address', { ...validContext, addressValidationPending: true })).toContain('Aguarde');
  });

  it('blocks an address whose current coverage is not confirmed', () => {
    expect(getCheckoutStepError('address', { ...validContext, addressQuoteCurrent: false })).toContain('atendido');
  });

  it('blocks an unavailable scheduling selection', () => {
    expect(getCheckoutStepError('payment', { ...validContext, schedulingValid: false })).toContain('horário');
  });

  it('allows every valid step', () => {
    for (const step of getCheckoutSteps('delivery', false)) {
      expect(getCheckoutStepError(step.id, validContext)).toBeNull();
    }
  });
});
