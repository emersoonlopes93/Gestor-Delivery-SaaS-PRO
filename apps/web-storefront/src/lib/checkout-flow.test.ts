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
    expect(getAdjacentCheckoutStep(steps, 'address', 'back')).toBe('fulfillment');
    expect(getAdjacentCheckoutStep(steps, 'fulfillment', 'next')).toBe('address');
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
