import { describe, expect, it } from 'vitest';
import type { PublicCommercialPlanDTO } from '@gestor/types';
import { commercialPlanCta } from './commercial-pricing-presentation';

function plan(overrides: Partial<PublicCommercialPlanDTO> = {}): PublicCommercialPlanDTO {
  return {
    id: 'plan-1', name: 'Plano', slug: 'plano', description: null, type: 'revenue_tiered',
    cycleInterval: 'monthly', currency: 'BRL', trialDays: 0, requiresPaymentMethod: false,
    includedModules: [], revenueTiers: [], ...overrides,
  };
}

describe('commercial pricing presentation', () => {
  it('does not promise a free trial when the plan requires a payment method', () => {
    expect(commercialPlanCta(plan({ trialDays: 14, requiresPaymentMethod: true }))).toBe('Conhecer a oferta');
  });

  it('uses a trial invitation only for an eligible public plan', () => {
    expect(commercialPlanCta(plan({ trialDays: 14 }))).toBe('Começar teste de 14 dias');
  });
});
