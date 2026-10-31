import { BillingGatewayMode, PaymentProvider } from '@prisma/client';
import { BillingPaymentGatewayService } from './billing-payment-gateway.service';

const billingEnvironmentKeys = [
  'BILLING_PAYMENTS_ENABLED',
  'BILLING_GATEWAY_PROVIDER',
  'BILLING_GATEWAY_MODE',
  'ASAAS_BILLING_API_KEY',
  'ASAAS_BILLING_BASE_URL',
  'NODE_ENV',
] as const;

describe('BillingPaymentGatewayService runtime truth', () => {
  const originalEnvironment = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of billingEnvironmentKeys) originalEnvironment.set(key, process.env[key]);
  });

  afterEach(() => {
    for (const key of billingEnvironmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnvironment.clear();
  });

  function service(): BillingPaymentGatewayService {
    return new BillingPaymentGatewayService({} as never, {} as never, {} as never);
  }

  it('reports payments disabled without presenting automatic billing', () => {
    process.env.BILLING_PAYMENTS_ENABLED = 'false';
    process.env.BILLING_GATEWAY_PROVIDER = 'manual';
    process.env.BILLING_GATEWAY_MODE = 'disabled';

    const runtime = service().getRuntimeConfig();

    expect(runtime.paymentsEnabled).toBe(false);
    expect(runtime.gatewayStatus).toBe('disabled');
    expect(runtime.productionAllowed).toBe(false);
  });

  it('reports a manual gateway as available only for admin-initiated attempts', () => {
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.BILLING_GATEWAY_PROVIDER = PaymentProvider.manual;
    process.env.BILLING_GATEWAY_MODE = BillingGatewayMode.manual;

    const runtime = service().getRuntimeConfig();

    expect(runtime.paymentsEnabled).toBe(true);
    expect(runtime.gatewayStatus).toBe('manual_ready');
    expect(runtime.gatewayStatusReason).toContain('administrativamente');
    expect(runtime.productionAllowed).toBe(false);
  });

  it('reports mock and valid Asaas sandbox as sandbox-only capabilities', () => {
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.BILLING_GATEWAY_PROVIDER = PaymentProvider.mock;
    process.env.BILLING_GATEWAY_MODE = BillingGatewayMode.sandbox;
    expect(service().getRuntimeConfig().gatewayStatus).toBe('sandbox_ready');

    process.env.BILLING_GATEWAY_PROVIDER = PaymentProvider.asaas;
    process.env.ASAAS_BILLING_API_KEY = 'sandbox-key-only';
    process.env.ASAAS_BILLING_BASE_URL = 'https://api-sandbox.asaas.com/v3';
    const asaasRuntime = service().getRuntimeConfig();
    expect(asaasRuntime.gatewayStatus).toBe('sandbox_ready');
    expect(asaasRuntime.productionAllowed).toBe(false);
  });

  it('fails closed for live or incomplete provider configuration even under production NODE_ENV', () => {
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.BILLING_GATEWAY_PROVIDER = PaymentProvider.asaas;
    process.env.BILLING_GATEWAY_MODE = BillingGatewayMode.production;
    process.env.NODE_ENV = 'production';
    process.env.ASAAS_BILLING_API_KEY = 'not-a-live-key';

    const productionRuntime = service().getRuntimeConfig();
    expect(productionRuntime.gatewayStatus).toBe('invalid_configuration');
    expect(productionRuntime.productionAllowed).toBe(false);
    expect(productionRuntime.gatewayStatusReason).toContain('bloqueada');

    process.env.BILLING_GATEWAY_MODE = BillingGatewayMode.sandbox;
    process.env.ASAAS_BILLING_BASE_URL = 'https://api.asaas.com/v3';
    const liveUrlRuntime = service().getRuntimeConfig();
    expect(liveUrlRuntime.gatewayStatus).toBe('invalid_configuration');
    expect(liveUrlRuntime.gatewayStatusReason).toContain('sandbox');
  });
});
