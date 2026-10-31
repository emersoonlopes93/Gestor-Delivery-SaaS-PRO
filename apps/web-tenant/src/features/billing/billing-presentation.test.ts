import { describe, expect, it } from 'vitest';
import type { TenantBillingPaymentModeInfo } from './billing-api';
import {
  billingGatewayCapabilityLabel,
  billingProductionCapabilityLabel,
} from './billing-presentation';

function paymentModeInfo(overrides: Partial<TenantBillingPaymentModeInfo> = {}): TenantBillingPaymentModeInfo {
  return {
    paymentsEnabled: false,
    provider: 'manual',
    mode: 'disabled',
    productionAllowed: false,
    supportedProviders: ['manual', 'mock', 'asaas'],
    gatewayStatus: 'disabled',
    gatewayStatusReason: 'Pagamentos por tentativa estao desativados neste ambiente.',
    automaticBillingActive: false,
    message: 'Pagamentos por tentativa estao desativados neste ambiente.',
    ...overrides,
  };
}

describe('billing portal capability presentation', () => {
  it('distinguishes disabled, manual and sandbox attempt capabilities', () => {
    expect(billingGatewayCapabilityLabel(paymentModeInfo())).toBe('Desativadas');
    expect(billingGatewayCapabilityLabel(paymentModeInfo({ gatewayStatus: 'manual_ready' }))).toBe('Manuais disponiveis');
    expect(billingGatewayCapabilityLabel(paymentModeInfo({ gatewayStatus: 'sandbox_ready' }))).toBe('Sandbox disponivel');
  });

  it('keeps production billing visibly blocked unless the server explicitly authorizes it', () => {
    expect(billingProductionCapabilityLabel(paymentModeInfo())).toBe('Bloqueada');
    expect(billingProductionCapabilityLabel(undefined)).toBe('Bloqueada');
  });
});
