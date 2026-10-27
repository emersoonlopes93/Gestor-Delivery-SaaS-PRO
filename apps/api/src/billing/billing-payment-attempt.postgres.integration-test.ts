import { randomUUID } from 'node:crypto';
import {
  BillingGatewayMode,
  InvoiceStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  PrismaClient,
  TenantSubscriptionStatus,
} from '@prisma/client';
import { BillingPaymentAttemptService } from './billing-payment-attempt.service';

const ephemeralHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabase(): void {
  const url = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!url || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(url);
  const direct = new URL(directUrl);
  if (!ephemeralHosts.has(database.hostname) || !ephemeralHosts.has(direct.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Billing payment attempt integration test refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Billing payment attempt PostgreSQL proof', () => {
  const prisma = new PrismaClient();
  const tenantIds: string[] = [];

  beforeAll(async () => {
    assertEphemeralDatabase();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  async function fixture() {
    const token = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({ data: { name: `Billing proof ${token}`, slug: `billing-proof-${token}` } });
    tenantIds.push(tenant.id);
    const plan = await prisma.billingPlan.create({
      data: { name: `Plan ${token}`, slug: `billing-proof-${token}`, type: 'fixed', cycleInterval: 'monthly', isActive: true, isPublic: false },
    });
    const subscription = await prisma.tenantBillingSubscription.create({
      data: { tenantId: tenant.id, billingPlanId: plan.id, status: TenantSubscriptionStatus.active, startedAt: new Date() },
    });
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        number: `proof-${token}`,
        status: InvoiceStatus.draft,
        subtotal: 25,
        total: 25,
        dueDate: new Date(Date.now() + 86_400_000),
      },
    });
    return { tenant, invoice };
  }

  function gatewayHarness() {
    let release: (() => void) | undefined;
    const submitted = new Promise<void>((resolve) => { release = resolve; });
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { startedResolve = resolve; });
    const createPaymentForInvoice = jest.fn(async () => {
      startedResolve?.();
      await submitted;
      return {
        provider: PaymentProvider.mock,
        mode: BillingGatewayMode.sandbox,
        status: PaymentAttemptStatus.pending,
        providerPaymentId: `mock-${randomUUID()}`,
        providerPaymentUrl: 'https://payment.invalid/mock',
        providerCustomerId: null,
        errorCode: null,
        errorMessage: null,
        metadataJson: {},
        requestJson: {},
        responseJson: {},
      };
    });
    return {
      gateway: { assertPaymentsEnabled: jest.fn(), createPaymentForInvoice },
      createPaymentForInvoice,
      started,
      release: () => release?.(),
    };
  }

  it('submits at most one external charge for simultaneous different keys and keeps the durable reservation', async () => {
    const { tenant, invoice } = await fixture();
    const harness = gatewayHarness();
    const service = new BillingPaymentAttemptService(prisma as never, harness.gateway as never);
    const first = service.createAttemptForInvoice({ invoiceId: invoice.id, tenantId: tenant.id, provider: PaymentProvider.mock, mode: BillingGatewayMode.sandbox, idempotencyKey: 'first' });
    await harness.started;
    const second = await service.createAttemptForInvoice({ invoiceId: invoice.id, tenantId: tenant.id, provider: PaymentProvider.mock, mode: BillingGatewayMode.sandbox, idempotencyKey: 'second' });
    harness.release();
    await first;

    expect(harness.createPaymentForInvoice).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(PaymentAttemptStatus.processing);
    expect(await prisma.paymentAttempt.count({ where: { invoiceId: invoice.id } })).toBe(1);
  });

  it('retains unknown outcome after timeout and rejects another provider submission with another key', async () => {
    const { tenant, invoice } = await fixture();
    const gateway = {
      assertPaymentsEnabled: jest.fn(),
      createPaymentForInvoice: jest.fn().mockRejectedValue(new Error('simulated timeout')),
    };
    const service = new BillingPaymentAttemptService(prisma as never, gateway as never);
    const input = { invoiceId: invoice.id, tenantId: tenant.id, provider: PaymentProvider.mock, mode: BillingGatewayMode.sandbox };

    await expect(service.createAttemptForInvoice({ ...input, idempotencyKey: 'timeout' })).rejects.toThrow('simulated timeout');
    const retry = await service.createAttemptForInvoice({ ...input, idempotencyKey: 'retry' });
    expect(gateway.createPaymentForInvoice).toHaveBeenCalledTimes(1);
    expect(retry.status).toBe(PaymentAttemptStatus.processing);
    expect(retry.metadataJson).toEqual(expect.objectContaining({ gatewaySubmission: 'unknown_outcome' }));
  });
});
