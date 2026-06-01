import {
  BillingGatewayMode,
  InvoiceStatus,
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

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function shouldSkip(): boolean {
  return process.env.BILLING_PAYMENTS_ENABLED !== 'true'
    || process.env.BILLING_GATEWAY_PROVIDER !== 'asaas'
    || process.env.BILLING_GATEWAY_MODE !== 'sandbox'
    || !process.env.ASAAS_BILLING_API_KEY?.trim();
}

async function ensurePlan(prisma: PrismaService) {
  return prisma.billingPlan.upsert({
    where: { slug: 'phase6-asaas-sandbox' },
    update: {
      name: 'Phase 6 Asaas Sandbox',
      isActive: true,
      isPublic: false,
      requiresPaymentMethod: false,
      allowAllModules: true,
    },
    create: {
      name: 'Phase 6 Asaas Sandbox',
      slug: 'phase6-asaas-sandbox',
      type: 'revenue_tiered',
      cycleInterval: 'monthly',
      isActive: true,
      isPublic: false,
      currency: 'BRL',
      trialDays: 0,
      requiresPaymentMethod: false,
      allowAllModules: true,
    },
  });
}

async function main() {
  if (shouldSkip()) {
    console.log('Billing Asaas sandbox smoke skipped: set BILLING_PAYMENTS_ENABLED=true, BILLING_GATEWAY_PROVIDER=asaas, BILLING_GATEWAY_MODE=sandbox and ASAAS_BILLING_API_KEY to run it.');
    return;
  }

  const prisma = new PrismaService(new TenantContextService());
  await prisma.$connect();
  const paymentAttemptService = new BillingPaymentAttemptService(
    prisma,
    new BillingPaymentGatewayService(
      new ManualBillingPaymentProvider(),
      new MockBillingPaymentProvider(),
      new AsaasBillingPaymentProvider(new AsaasBillingClientService()),
    ),
  );

  let tenantId: string | null = null;

  try {
    const plan = await ensurePlan(prisma);
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Phase 6 Asaas Sandbox Smoke',
        slug: `phase6-asaas-${Date.now()}`,
      },
    });
    tenantId = tenant.id;

    const subscription = await prisma.tenantBillingSubscription.create({
      data: {
        tenantId: tenant.id,
        billingPlanId: plan.id,
        status: TenantSubscriptionStatus.active,
        requiresPaymentMethod: false,
      },
    });
    const cycle = await prisma.billingCycleRecord.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        startedAt: new Date('2026-06-01T00:00:00.000Z'),
        endedAt: new Date('2026-07-01T00:00:00.000Z'),
        status: 'invoiced',
        totalAmount: new Prisma.Decimal('5.00'),
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        cycleId: cycle.id,
        number: `ASAAS-SMOKE-${Date.now()}`,
        status: InvoiceStatus.draft,
        subtotal: new Prisma.Decimal('5.00'),
        discountTotal: new Prisma.Decimal('0.00'),
        taxTotal: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('5.00'),
        currency: 'BRL',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        provider: PaymentProvider.manual,
      },
    });

    const attempt1 = await paymentAttemptService.createAttemptForInvoice({
      invoiceId: invoice.id,
      tenantId: tenant.id,
      provider: PaymentProvider.asaas,
      mode: BillingGatewayMode.sandbox,
      idempotencyKey: `asaas-sandbox-smoke:${invoice.id}`,
    });
    const attempt2 = await paymentAttemptService.createAttemptForInvoice({
      invoiceId: invoice.id,
      tenantId: tenant.id,
      provider: PaymentProvider.asaas,
      mode: BillingGatewayMode.sandbox,
      idempotencyKey: `asaas-sandbox-smoke:${invoice.id}`,
    });
    const openedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    const persistedSubscription = await prisma.tenantBillingSubscription.findUniqueOrThrow({ where: { id: subscription.id } });

    assert(attempt1.id === attempt2.id, 'Asaas sandbox idempotency must return same attempt');
    assert(attempt1.provider === PaymentProvider.asaas, 'Attempt provider must be asaas');
    assert(attempt1.mode === BillingGatewayMode.sandbox, 'Attempt mode must be sandbox');
    assert(Boolean(attempt1.providerPaymentId), 'providerPaymentId must be saved');
    assert(Boolean(openedInvoice.providerPaymentUrl), 'providerPaymentUrl must be saved on invoice');
    assert(Boolean(persistedSubscription.providerCustomerId), 'providerCustomerId must be saved on subscription');
    assert(openedInvoice.status === InvoiceStatus.open || openedInvoice.status === InvoiceStatus.paid, 'invoice must move from draft to open/paid according to provider status');
    assert(await prisma.paymentAttempt.count({ where: { invoiceId: invoice.id } }) === 1, 'idempotent repeat must not duplicate attempts');

    console.log('Billing Asaas sandbox smoke passed:', {
      invoiceId: invoice.id,
      attemptId: attempt1.id,
      providerCustomerId: persistedSubscription.providerCustomerId,
      providerPaymentId: attempt1.providerPaymentId,
      providerPaymentUrl: openedInvoice.providerPaymentUrl,
      invoiceStatus: openedInvoice.status,
    });
  } finally {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Billing Asaas sandbox smoke failed:', error);
  process.exit(1);
});
