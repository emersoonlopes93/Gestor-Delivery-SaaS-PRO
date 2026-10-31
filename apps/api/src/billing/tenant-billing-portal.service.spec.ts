import { BillingGatewayMode, PaymentProvider } from '@prisma/client';
import { BillingPaymentRuntimeConfig } from './billing-payment-gateway.service';
import {
  TenantBillingPortalPaymentModeInfo,
  TenantBillingPortalService,
} from './tenant-billing-portal.service';

describe('TenantBillingPortalService payment mode projection', () => {
  function runtime(overrides: Partial<BillingPaymentRuntimeConfig> = {}): BillingPaymentRuntimeConfig {
    return {
      paymentsEnabled: true,
      provider: PaymentProvider.manual,
      mode: BillingGatewayMode.manual,
      productionAllowed: false,
      supportedProviders: [PaymentProvider.manual, PaymentProvider.mock, PaymentProvider.asaas],
      gatewayStatus: 'manual_ready',
      gatewayStatusReason: 'Tentativas podem ser iniciadas administrativamente; cobranca recorrente automatica nao esta habilitada.',
      ...overrides,
    };
  }

  function paymentModeInfo(config: BillingPaymentRuntimeConfig): TenantBillingPortalPaymentModeInfo {
    const service = new TenantBillingPortalService(
      {} as never,
      {} as never,
      {} as never,
      { getRuntimeConfig: jest.fn().mockReturnValue(config) } as never,
      {} as never,
    );
    const buildPaymentModeInfo = Reflect.get(service, 'buildPaymentModeInfo');
    if (typeof buildPaymentModeInfo !== 'function') {
      throw new Error('buildPaymentModeInfo indisponivel para teste.');
    }
    return buildPaymentModeInfo.call(service) as TenantBillingPortalPaymentModeInfo;
  }

  it('preserves manual gateway availability without claiming recurring automation', () => {
    const info = paymentModeInfo(runtime());

    expect(info.paymentsEnabled).toBe(true);
    expect(info.gatewayStatus).toBe('manual_ready');
    expect(info.automaticBillingActive).toBe(false);
    expect(info.productionAllowed).toBe(false);
    expect(info.message).toContain('administrativamente');
  });

  it('preserves sandbox gateway availability without claiming recurring automation', () => {
    const info = paymentModeInfo(runtime({
      provider: PaymentProvider.asaas,
      mode: BillingGatewayMode.sandbox,
      gatewayStatus: 'sandbox_ready',
      gatewayStatusReason: 'Tentativas sandbox podem ser iniciadas administrativamente; cobranca recorrente automatica nao esta habilitada.',
    }));

    expect(info.paymentsEnabled).toBe(true);
    expect(info.gatewayStatus).toBe('sandbox_ready');
    expect(info.automaticBillingActive).toBe(false);
    expect(info.productionAllowed).toBe(false);
  });

  it('keeps invalid configuration fail-closed in the tenant portal', () => {
    const info = paymentModeInfo(runtime({
      provider: PaymentProvider.asaas,
      mode: BillingGatewayMode.production,
      gatewayStatus: 'invalid_configuration',
      gatewayStatusReason: 'Cobranca real em producao permanece bloqueada nesta fase.',
    }));

    expect(info.gatewayStatus).toBe('invalid_configuration');
    expect(info.automaticBillingActive).toBe(false);
    expect(info.productionAllowed).toBe(false);
    expect(info.message).toContain('bloqueada');
  });
});
