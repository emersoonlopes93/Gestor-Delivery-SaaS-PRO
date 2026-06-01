import {
  BillingGatewayMode,
  InvoiceStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  Prisma,
  TenantSubscriptionStatus,
} from '@prisma/client';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { PrismaService } from '../src/database/prisma.service';
import { BillingPaymentAttemptService } from '../src/billing/billing-payment-attempt.service';
import { BillingPaymentGatewayService } from '../src/billing/billing-payment-gateway.service';
import { ManualBillingPaymentProvider } from '../src/billing/manual-billing-payment.provider';
import { MockBillingPaymentProvider } from '../src/billing/mock-billing-payment.provider';
import { AsaasBillingClientService } from '../src/billing/asaas-billing-client.service';
import { AsaasBillingPaymentProvider } from '../src/billing/asaas-billing-payment.provider';

function assertStringEquals(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertNumberEquals(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function expectDisabledFlagError(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error && error.message.includes('desativados')) return;
    throw error;
  }
  throw new Error('Expected disabled payments flag to reject payment attempt creation.');
}

async function ensureRevenueGrowthPlan(prisma: PrismaService) {
  return prisma.billingPlan.upsert({
    where: { slug: 'revenue-growth' },
    update: {
      name: 'Crescimento por Faturamento',
      type: 'revenue_tiered',
      cycleInterval: 'monthly',
      isActive: true,
      isPublic: true,
      currency: 'BRL',
      trialDays: 7,
      requiresPaymentMethod: false,
      allowAllModules: true,
    },
    create: {
      name: 'Crescimento por Faturamento',
      slug: 'revenue-growth',
      type: 'revenue_tiered',
      cycleInterval: 'monthly',
      isActive: true,
      isPublic: true,
      currency: 'BRL',
      trialDays: 7,
      requiresPaymentMethod: false,
      allowAllModules: true,
    },
  });
}

async function main() {
  const originalPaymentsEnabled = process.env.BILLING_PAYMENTS_ENABLED;
  const originalGatewayProvider = process.env.BILLING_GATEWAY_PROVIDER;
  const originalGatewayMode = process.env.BILLING_GATEWAY_MODE;

  const tenantContext = new TenantContextService();
  const prisma = new PrismaService(tenantContext);
  await prisma.$connect();

  const gatewayService = new BillingPaymentGatewayService(
    new ManualBillingPaymentProvider(),
    new MockBillingPaymentProvider(),
    new AsaasBillingPaymentProvider(new AsaasBillingClientService()),
  );
  const paymentAttemptService = new BillingPaymentAttemptService(prisma, gatewayService);

  let tenantId: string | null = null;

  try {
    const plan = await ensureRevenueGrowthPlan(prisma);
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Billing Payment Smoke',
        slug: `billing-payment-${Date.now()}`,
      },
    });
    tenantId = tenant.id;

    const subscription = await prisma.tenantBillingSubscription.create({
      data: {
        tenantId: tenant.id,
        billingPlanId: plan.id,
        status: TenantSubscriptionStatus.active,
        startedAt: new Date('2026-05-01T00:00:00.000Z'),
        currentCycleStartedAt: new Date('2026-05-01T00:00:00.000Z'),
        currentCycleEndsAt: new Date('2026-06-01T00:00:00.000Z'),
        requiresPaymentMethod: false,
      },
    });

    const cycle = await prisma.billingCycleRecord.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        startedAt: new Date('2026-05-01T00:00:00.000Z'),
        endedAt: new Date('2026-06-01T00:00:00.000Z'),
        status: 'invoiced',
        measuredRevenue: new Prisma.Decimal('1650.00'),
        billableRevenue: new Prisma.Decimal('1650.00'),
        baseAmount: new Prisma.Decimal('100.00'),
        addonsAmount: new Prisma.Decimal('0.00'),
        totalAmount: new Prisma.Decimal('100.00'),
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        cycleId: cycle.id,
        number: `PAY-${tenant.id.slice(0, 8).toUpperCase()}-${cycle.id.slice(0, 8).toUpperCase()}`,
        status: InvoiceStatus.draft,
        subtotal: new Prisma.Decimal('100.00'),
        discountTotal: new Prisma.Decimal('0.00'),
        taxTotal: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('100.00'),
        dueDate: new Date('2026-06-08T00:00:00.000Z'),
        provider: PaymentProvider.manual,
        items: {
          create: {
            type: 'payment_smoke',
            description: 'Billing payment smoke invoice item',
            quantity: 1,
            unitAmount: new Prisma.Decimal('100.00'),
            totalAmount: new Prisma.Decimal('100.00'),
            metadata: { smoke: true },
          },
        },
      },
    });

    process.env.BILLING_PAYMENTS_ENABLED = 'false';
    process.env.BILLING_GATEWAY_PROVIDER = 'mock';
    process.env.BILLING_GATEWAY_MODE = 'sandbox';

    await expectDisabledFlagError(() => paymentAttemptService.createAttemptForInvoice({
      invoiceId: invoice.id,
      tenantId: tenant.id,
      provider: PaymentProvider.mock,
      mode: BillingGatewayMode.sandbox,
      idempotencyKey: 'smoke-disabled',
      simulate: 'pending',
    }));

    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.BILLING_GATEWAY_PROVIDER = 'mock';
    process.env.BILLING_GATEWAY_MODE = 'sandbox';

    const attempt1 = await paymentAttemptService.createAttemptForInvoice({
      invoiceId: invoice.id,
      tenantId: tenant.id,
      provider: PaymentProvider.mock,
      mode: BillingGatewayMode.sandbox,
      idempotencyKey: 'smoke-mock-sandbox',
      simulate: 'pending',
    });
    assertStringEquals(attempt1.status, PaymentAttemptStatus.pending, 'Initial mock attempt status');

    const openedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    assertStringEquals(openedInvoice.status, InvoiceStatus.open, 'Invoice status after payment attempt');

    const attempt2 = await paymentAttemptService.createAttemptForInvoice({
      invoiceId: invoice.id,
      tenantId: tenant.id,
      provider: PaymentProvider.mock,
      mode: BillingGatewayMode.sandbox,
      idempotencyKey: 'smoke-mock-sandbox',
      simulate: 'pending',
    });
    assertStringEquals(attempt2.id, attempt1.id, 'Idempotent repeat should return the first attempt');
    assertNumberEquals(
      await prisma.paymentAttempt.count({ where: { invoiceId: invoice.id } }),
      1,
      'Idempotent repeat must not duplicate attempts',
    );

    await paymentAttemptService.markAttemptSucceeded({
      attemptId: attempt1.id,
      reason: 'smoke_mark_paid',
    });

    const paidInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    assertStringEquals(paidInvoice.status, InvoiceStatus.paid, 'Invoice status after payment success');

    console.log('Billing payment smoke passed:', {
      invoiceId: invoice.id,
      attemptId: attempt1.id,
      providerPaymentId: attempt1.providerPaymentId,
      status: paidInvoice.status,
    });
  } finally {
    process.env.BILLING_PAYMENTS_ENABLED = originalPaymentsEnabled;
    process.env.BILLING_GATEWAY_PROVIDER = originalGatewayProvider;
    process.env.BILLING_GATEWAY_MODE = originalGatewayMode;
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Billing payment smoke failed:', error);
  process.exit(1);
});
