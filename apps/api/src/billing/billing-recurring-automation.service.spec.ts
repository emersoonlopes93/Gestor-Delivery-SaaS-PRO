import { BillingCycleStatus, BillingGatewayMode, PaymentProvider } from '@prisma/client';
import { BillingRecurringAutomationService } from './billing-recurring-automation.service';

describe('BillingRecurringAutomationService', () => {
  const original = new Map<string, string | undefined>();
  const keys = ['BILLING_AUTOMATION_ENABLED', 'BILLING_AUTOMATION_KILL_SWITCH', 'BILLING_PAYMENTS_ENABLED', 'NODE_ENV'] as const;

  beforeEach(() => keys.forEach((key) => original.set(key, process.env[key])));
  afterEach(() => keys.forEach((key) => {
    const value = original.get(key);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }));

  function build(overrides: { cycles?: unknown[]; runtime?: unknown; invoice?: unknown; processing?: unknown } = {}) {
    const prisma = {
      billingCycleRecord: { findMany: jest.fn().mockResolvedValue(overrides.cycles ?? []) },
      invoice: { findFirst: jest.fn().mockResolvedValue(overrides.invoice ?? null) },
      paymentAttempt: { findFirst: jest.fn().mockResolvedValue(overrides.processing ?? null) },
    };
    const cycles = { closeCycleAndCreateDraftInvoice: jest.fn().mockResolvedValue({ invoice: { id: 'invoice-1' } }) };
    const attempts = { createAttemptForInvoice: jest.fn().mockResolvedValue({ id: 'attempt-1' }) };
    const gateway = { getRuntimeConfig: jest.fn().mockReturnValue(overrides.runtime ?? {
      paymentsEnabled: true, provider: PaymentProvider.mock, mode: BillingGatewayMode.sandbox,
      productionAllowed: false, supportedProviders: [PaymentProvider.mock], gatewayStatus: 'sandbox_ready', gatewayStatusReason: null,
    }) };
    return { service: new BillingRecurringAutomationService(prisma as never, cycles as never, attempts as never, gateway as never), prisma, cycles, attempts };
  }

  it('is off by default and performs no database reads or writes', async () => {
    delete process.env.BILLING_AUTOMATION_ENABLED;
    const { service, prisma } = build();
    const result = await service.runBatch();
    expect(result.results[0]).toMatchObject({ outcome: 'blocked' });
    expect(prisma.billingCycleRecord.findMany).not.toHaveBeenCalled();
  });

  it('dry-runs a persisted overdue active cycle without closing it or creating an attempt', async () => {
    process.env.BILLING_AUTOMATION_ENABLED = 'true';
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    const cycle = { id: 'cycle-1', tenantId: 'tenant-1', endedAt: new Date('2026-01-01T00:00:00.000Z'), status: BillingCycleStatus.open, subscription: { id: 'subscription-1', billingPlanId: 'plan-1', status: 'active' } };
    const { service, cycles, attempts } = build({ cycles: [cycle] });
    const result = await service.runBatch({ now: new Date('2026-01-02T00:00:00.000Z'), dryRun: true });
    expect(result.results).toEqual([{ cycleId: 'cycle-1', tenantId: 'tenant-1', outcome: 'processed', reason: 'eligible_no_writes' }]);
    expect(cycles.closeCycleAndCreateDraftInvoice).not.toHaveBeenCalled();
    expect(attempts.createAttemptForInvoice).not.toHaveBeenCalled();
  });

  it('creates at most one sandbox attempt with a stable key and never replays a processing attempt', async () => {
    process.env.BILLING_AUTOMATION_ENABLED = 'true';
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    const cycle = { id: 'cycle-1', tenantId: 'tenant-1', endedAt: new Date('2026-01-01T00:00:00.000Z'), status: BillingCycleStatus.closed, subscription: { id: 'subscription-1', billingPlanId: 'plan-1', status: 'active' } };
    const { service, attempts } = build({ cycles: [cycle] });
    await service.runBatch({ now: new Date('2026-01-02T00:00:00.000Z') });
    expect(attempts.createAttemptForInvoice).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'billing-recurring:cycle-1:mock:sandbox' }));

    const blocked = build({ cycles: [cycle], processing: { id: 'attempt-unknown' } });
    const result = await blocked.service.runBatch({ now: new Date('2026-01-02T00:00:00.000Z') });
    expect(result.results[0]).toMatchObject({ outcome: 'requires_manual_reconciliation' });
    expect(blocked.attempts.createAttemptForInvoice).not.toHaveBeenCalled();
  });

  it('does not run in production even if flags are active', async () => {
    process.env.BILLING_AUTOMATION_ENABLED = 'true';
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    const { service, prisma } = build();
    const result = await service.runBatch();
    expect(result.results[0]).toMatchObject({ outcome: 'blocked' });
    expect(prisma.billingCycleRecord.findMany).not.toHaveBeenCalled();
  });
});
