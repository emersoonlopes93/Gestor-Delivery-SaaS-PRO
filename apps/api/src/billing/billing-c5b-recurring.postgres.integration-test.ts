import { BillingGatewayMode, InvoiceStatus, PaymentAttemptStatus, PaymentProvider, PrismaClient, TenantSubscriptionStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BillingPaymentAttemptService } from './billing-payment-attempt.service';
import { BillingRecurringAutomationService } from './billing-recurring-automation.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabase(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('C5-B proof requires NODE_ENV=test.');
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || !allowedHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('C5-B proof refused a non-ephemeral PostgreSQL target.');
  }
}

describe('C5-B recurring billing PostgreSQL guard', () => {
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  const tenantIds: string[] = [];

  beforeAll(async () => {
    assertEphemeralDatabase();
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });

  afterAll(async () => {
    await prismaA.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
  });

  async function invoiceFixture() {
    const token = randomUUID().slice(0, 8);
    const tenant = await prismaA.tenant.create({ data: { name: `C5B ${token}`, slug: `c5b-${token}` } });
    tenantIds.push(tenant.id);
    const plan = await prismaA.billingPlan.create({ data: { name: `C5B ${token}`, slug: `c5b-plan-${token}`, type: 'fixed', cycleInterval: 'monthly', isActive: true, isPublic: false } });
    const subscription = await prismaA.tenantBillingSubscription.create({ data: { tenantId: tenant.id, billingPlanId: plan.id, status: TenantSubscriptionStatus.active, startedAt: new Date() } });
    const invoice = await prismaA.invoice.create({ data: { tenantId: tenant.id, subscriptionId: subscription.id, number: `c5b-${token}`, status: InvoiceStatus.draft, subtotal: 25, total: 25, dueDate: new Date() } });
    return { tenant, invoice };
  }

  it('uses two independent PostgreSQL clients to reserve at most one sandbox submission', async () => {
    const { tenant, invoice } = await invoiceFixture();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered: (() => void) | undefined;
    const providerEntered = new Promise<void>((resolve) => { entered = resolve; });
    const gateway = { assertPaymentsEnabled: jest.fn(), createPaymentForInvoice: jest.fn(async () => {
      entered?.(); await gate;
      return { provider: PaymentProvider.mock, mode: BillingGatewayMode.sandbox, status: PaymentAttemptStatus.pending, providerPaymentId: `mock-${randomUUID()}`, providerPaymentUrl: null, providerCustomerId: null, errorCode: null, errorMessage: null, metadataJson: {}, requestJson: {}, responseJson: {} };
    }) };
    const input = { invoiceId: invoice.id, tenantId: tenant.id, provider: PaymentProvider.mock, mode: BillingGatewayMode.sandbox };
    const first = new BillingPaymentAttemptService(prismaA as never, gateway as never).createAttemptForInvoice({ ...input, idempotencyKey: 'worker-a' });
    await providerEntered;
    const second = await new BillingPaymentAttemptService(prismaB as never, gateway as never).createAttemptForInvoice({ ...input, idempotencyKey: 'worker-b' });
    release?.(); await first;
    expect(gateway.createPaymentForInvoice).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(PaymentAttemptStatus.processing);
    expect(await prismaA.paymentAttempt.count({ where: { invoiceId: invoice.id } })).toBe(1);
  });

  it('keeps a timeout outcome durable and never replays it', async () => {
    const { tenant, invoice } = await invoiceFixture();
    const gateway = { assertPaymentsEnabled: jest.fn(), createPaymentForInvoice: jest.fn().mockRejectedValue(new Error('timeout')) };
    const service = new BillingPaymentAttemptService(prismaA as never, gateway as never);
    const input = { invoiceId: invoice.id, tenantId: tenant.id, provider: PaymentProvider.mock, mode: BillingGatewayMode.sandbox };
    await expect(service.createAttemptForInvoice({ ...input, idempotencyKey: 'timeout' })).rejects.toThrow('timeout');
    const replay = await service.createAttemptForInvoice({ ...input, idempotencyKey: 'replay' });
    expect(gateway.createPaymentForInvoice).toHaveBeenCalledTimes(1);
    expect(replay.status).toBe(PaymentAttemptStatus.processing);
    expect(replay.metadataJson).toEqual(expect.objectContaining({ gatewaySubmission: 'unknown_outcome' }));
  });

  it('uses two independent PostgreSQL connections and leaves dry-run without writes', async () => {
    const token = randomUUID().slice(0, 8);
    const tenant = await prismaA.tenant.create({ data: { name: `C5B ${token}`, slug: `c5b-${token}` } });
    tenantIds.push(tenant.id);
    const before = await prismaA.billingCycleRecord.count({ where: { tenantId: tenant.id } });
    const service = new BillingRecurringAutomationService(
      prismaA as never,
      {} as never,
      {} as never,
      { getRuntimeConfig: () => ({ paymentsEnabled: true, gatewayStatus: 'sandbox_ready' }) } as never,
    );
    process.env.BILLING_AUTOMATION_ENABLED = 'true';
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    const result = await service.runBatch({ dryRun: true, limit: 1 });
    const after = await prismaB.billingCycleRecord.count({ where: { tenantId: tenant.id } });
    expect(result.dryRun).toBe(true);
    expect(after).toBe(before);
  });
});
