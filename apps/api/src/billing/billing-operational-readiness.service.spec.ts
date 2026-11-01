import { BillingOperationalReadinessService } from './billing-operational-readiness.service';
import { BillingPaymentGatewayService } from './billing-payment-gateway.service';

describe('BillingOperationalReadinessService', () => {
  const originalEnvironment = new Map<string, string | undefined>();
  const environmentKeys = [
    'BILLING_PAYMENTS_ENABLED',
    'BILLING_GATEWAY_PROVIDER',
    'BILLING_GATEWAY_MODE',
    'BILLING_AUTOMATION_ENABLED',
    'BILLING_AUTOMATION_KILL_SWITCH',
    'BULLMQ_ENABLED',
    'REDIS_ENABLED',
    'NODE_ENV',
  ] as const;

  beforeEach(() => {
    for (const key of environmentKeys) originalEnvironment.set(key, process.env[key]);
  });

  afterEach(() => {
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnvironment.clear();
  });

  function service() {
    const gateway = new BillingPaymentGatewayService({} as never, {} as never, {} as never);
    return new BillingOperationalReadinessService(gateway);
  }

  it('keeps production mode fail-closed even when automation flags are permissive', () => {
    process.env.NODE_ENV = 'production';
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.BILLING_GATEWAY_PROVIDER = 'asaas';
    process.env.BILLING_GATEWAY_MODE = 'production';
    process.env.BILLING_AUTOMATION_ENABLED = 'true';
    process.env.BILLING_AUTOMATION_KILL_SWITCH = 'false';
    process.env.BULLMQ_ENABLED = 'true';
    process.env.REDIS_ENABLED = 'true';

    const readiness = service().getReadiness();

    expect(readiness.state).toBe('live_not_authorized');
    expect(readiness.realChargeEnabled).toBe(false);
    expect(readiness.automaticBillingActive).toBe(false);
    expect(readiness.productionAllowed).toBe(false);
    expect(readiness.automation.executionAllowed).toBe(false);
    expect(readiness.reconciliation.automaticReplayAllowed).toBe(false);
  });

  it('reports sandbox as non-live and stops execution through the kill switch', () => {
    process.env.NODE_ENV = 'test';
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.BILLING_GATEWAY_PROVIDER = 'mock';
    process.env.BILLING_GATEWAY_MODE = 'sandbox';
    process.env.BILLING_AUTOMATION_ENABLED = 'true';
    process.env.BILLING_AUTOMATION_KILL_SWITCH = 'true';
    process.env.BULLMQ_ENABLED = 'true';
    process.env.REDIS_ENABLED = 'true';

    const readiness = service().getReadiness();

    expect(readiness.state).toBe('sandbox');
    expect(readiness.realChargeEnabled).toBe(false);
    expect(readiness.automation.queueConfigured).toBe(true);
    expect(readiness.automation.executionAllowed).toBe(false);
    expect(readiness.reconciliation.unknownOutcomePolicy).toBe('requires_manual_reconciliation');
    expect(readiness.liveAuthorization.status).toBe('external_contract_pending');
  });

  it('fails closed for absent or invalid gateway configuration', () => {
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.BILLING_GATEWAY_PROVIDER = 'unsupported-provider';
    process.env.BILLING_GATEWAY_MODE = 'sandbox';

    const readiness = service().getReadiness();

    expect(readiness.state).toBe('invalid_configuration');
    expect(readiness.realChargeEnabled).toBe(false);
    expect(readiness.liveAuthorization.status).toBe('external_contract_pending');
  });
});
