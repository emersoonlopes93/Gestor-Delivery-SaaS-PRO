import 'reflect-metadata';
import {
  BillingGatewayMode,
  InvoiceStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentProvider,
  Prisma,
  RevenueEventType,
  TenantSubscriptionStatus,
  TenantStatus,
} from '@prisma/client';
import { ADMIN_PERMISSIONS_KEY } from '../src/common/decorators';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { PrismaService } from '../src/database/prisma.service';
import { BillingSettingsService } from '../src/billing/billing-settings.service';
import { BillingRatingService } from '../src/billing/billing-rating.service';
import { BillingUsageService } from '../src/billing/billing-usage.service';
import { BillingCycleService } from '../src/billing/billing-cycle.service';
import { InvoiceService } from '../src/billing/invoice.service';
import { RevenueLedgerService } from '../src/billing/revenue-ledger.service';
import { BillingPaymentAttemptService } from '../src/billing/billing-payment-attempt.service';
import { BillingPaymentGatewayService } from '../src/billing/billing-payment-gateway.service';
import { ManualBillingPaymentProvider } from '../src/billing/manual-billing-payment.provider';
import { MockBillingPaymentProvider } from '../src/billing/mock-billing-payment.provider';
import { AsaasBillingClientService } from '../src/billing/asaas-billing-client.service';
import { AsaasBillingPaymentProvider } from '../src/billing/asaas-billing-payment.provider';
import { TenantBillingResolverService } from '../src/billing/tenant-billing-resolver.service';
import { OrdersService } from '../src/orders/orders.service';
import { AdminBillingController } from '../src/admin/billing/admin-billing.controller';
import { AdminHealthService } from '../src/admin/health/admin-health.service';

const ZERO = new Prisma.Decimal(0);

type SmokeReport = {
  databaseHost: string;
  tenantId?: string;
  orderId?: string;
  revenueEventId?: string;
  snapshotId?: string;
  invoiceId?: string;
  paymentAttemptId?: string;
  subscriptionHistoryIds: string[];
  auditEndpointMethods: string[];
  healthStatus?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDecimalEquals(actual: Prisma.Decimal, expected: string, label: string): void {
  const expectedDecimal = new Prisma.Decimal(expected);
  if (!actual.equals(expectedDecimal)) {
    throw new Error(`${label}: expected ${expectedDecimal.toFixed(2)}, got ${actual.toFixed(2)}`);
  }
}

function databaseHost(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'unknown';
  }
}

async function ensureRevenueGrowthPlan(prisma: PrismaService) {
  const plan = await prisma.billingPlan.upsert({
    where: { slug: 'revenue-growth' },
    update: {
      name: 'Crescimento por Faturamento',
      type: 'revenue_tiered',
      cycleInterval: 'monthly',
      isActive: true,
      isPublic: true,
      currency: 'BRL',
      trialDays: 0,
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
      trialDays: 0,
      requiresPaymentMethod: false,
      allowAllModules: true,
    },
  });

  const tiers = [
    { minRevenue: '0.00', maxRevenue: '1500.00', price: '0.00', label: 'Ate R$ 1.500', sortOrder: 0 },
    { minRevenue: '1500.01', maxRevenue: '4000.00', price: '100.00', label: 'R$ 1.500,01 ate R$ 4.000', sortOrder: 1 },
    { minRevenue: '4000.01', maxRevenue: null, price: '300.00', label: 'Acima de R$ 4.000', sortOrder: 2 },
  ];

  for (const tier of tiers) {
    await prisma.billingRevenueTier.upsert({
      where: {
        planId_sortOrder: {
          planId: plan.id,
          sortOrder: tier.sortOrder,
        },
      },
      update: tier,
      create: {
        planId: plan.id,
        ...tier,
      },
    });
  }

  return plan;
}

async function createSmokeTenant(prisma: PrismaService) {
  const suffix = Date.now();
  return prisma.tenant.create({
    data: {
      name: 'Billing Ledger Smoke',
      slug: `billing-ledger-smoke-${suffix}`,
      settings: {
        create: {
          businessPhone: '11999999999',
          street: 'Rua Smoke',
          number: '100',
          neighborhood: 'Centro',
          city: 'Sao Paulo',
          state: 'SP',
          zipCode: '01000-000',
          paymentMethods: ['cash'],
        },
      },
    },
  });
}

async function createConfirmedOrder(prisma: PrismaService, tenantId: string) {
  const now = new Date();
  return prisma.order.create({
    data: {
      tenantId,
      orderNumber: `SMK-${String(now.getTime()).slice(-8)}`,
      status: OrderStatus.confirmed,
      fulfillmentType: 'pickup',
      customerName: 'Cliente Smoke',
      customerPhone: '11988887777',
      itemsSubtotal: new Prisma.Decimal('2000.00'),
      discountTotal: ZERO,
      deliveryFee: ZERO,
      serviceFee: ZERO,
      total: new Prisma.Decimal('2000.00'),
      sourceChannel: 'storefront',
      idempotencyKey: `billing-ledger-smoke-${tenantId}-${now.getTime()}`,
      paymentMethod: 'cash',
      publicTrackingToken: `billing-ledger-smoke-${tenantId}-${now.getTime()}-tracking`,
      createdAt: now,
      updatedAt: now,
    },
  });
}

function buildOrdersService(prisma: PrismaService, revenueLedgerService: RevenueLedgerService) {
  const noop = () => undefined;
  const resolved = () => Promise.resolve();
  return new OrdersService(
    prisma,
    {} as never,
    { syncCustomerOnOrderUpsert: jestlessNull } as never,
    { earnForOrder: resolved } as never,
    { awardForOrder: resolved } as never,
    { reverseOrderDepletion: resolved } as never,
    {} as never,
    {} as never,
    { notifyOrderStatus: resolved } as never,
    {
      emitOrderStatusUpdated: noop,
      emitOrderReady: noop,
      server: { to: () => ({ emit: noop }) },
    } as never,
    { createProductionJobs: async () => [{ id: 'smoke-production-job' }] } as never,
    revenueLedgerService,
  );
}

async function jestlessNull() {
  return null;
}

function assertAuditPermissionMetadata(): string[] {
  const methods = ['listRevenueEvents', 'listUsageSnapshots', 'listSubscriptionStatusHistory'] as const;
  for (const method of methods) {
    const handler = AdminBillingController.prototype[method];
    const permissions = Reflect.getMetadata(ADMIN_PERMISSIONS_KEY, handler) as string[] | undefined;
    assert(permissions?.includes('saas.billing.audit'), `${method} must require saas.billing.audit`);
  }
  return [...methods];
}

async function main() {
  const originalPaymentsEnabled = process.env.BILLING_PAYMENTS_ENABLED;
  const originalGatewayProvider = process.env.BILLING_GATEWAY_PROVIDER;
  const originalGatewayMode = process.env.BILLING_GATEWAY_MODE;

  const tenantContext = new TenantContextService();
  const prisma = new PrismaService(tenantContext);
  await prisma.$connect();

  const report: SmokeReport = {
    databaseHost: databaseHost(),
    subscriptionHistoryIds: [],
    auditEndpointMethods: [],
  };

  const gatewayService = new BillingPaymentGatewayService(
    new ManualBillingPaymentProvider(),
    new MockBillingPaymentProvider(),
    new AsaasBillingPaymentProvider(new AsaasBillingClientService()),
  );
  const billingSettingsService = new BillingSettingsService(prisma);
  const billingRatingService = new BillingRatingService(prisma);
  const revenueLedgerService = new RevenueLedgerService(prisma);
  const billingUsageService = new BillingUsageService(
    prisma,
    billingSettingsService,
    billingRatingService,
    revenueLedgerService,
  );
  const invoiceService = new InvoiceService(prisma, billingRatingService);
  const billingCycleService = new BillingCycleService(prisma, billingUsageService, invoiceService);
  const paymentAttemptService = new BillingPaymentAttemptService(prisma, gatewayService);
  const tenantBillingResolver = new TenantBillingResolverService(prisma, gatewayService);
  const ordersService = buildOrdersService(prisma, revenueLedgerService);
  const adminHealthService = new AdminHealthService(prisma);

  let tenantId: string | null = null;

  try {
    process.env.BILLING_PAYMENTS_ENABLED = 'true';
    process.env.BILLING_GATEWAY_PROVIDER = 'mock';
    process.env.BILLING_GATEWAY_MODE = 'sandbox';

    await billingSettingsService.ensureDefaultSettings();
    await revenueLedgerService.ensureActiveRuleVersion();
    const plan = await ensureRevenueGrowthPlan(prisma);
    const tenant = await createSmokeTenant(prisma);
    tenantId = tenant.id;
    report.tenantId = tenant.id;

    const subscription = await tenantBillingResolver.getOrCreateTenantBillingSubscription(tenant.id, plan.id);
    assertEquals(subscription.status, TenantSubscriptionStatus.active, 'Subscription status');

    const order = await createConfirmedOrder(prisma, tenant.id);
    report.orderId = order.id;
    await ordersService.updateOrderStatus(order.id, tenant.id, {
      status: OrderStatus.preparing,
      note: 'billing ledger smoke preparing',
    });
    await ordersService.updateOrderStatus(order.id, tenant.id, {
      status: OrderStatus.ready_for_pickup,
      note: 'billing ledger smoke ready',
    });
    await ordersService.updateOrderStatus(order.id, tenant.id, {
      status: OrderStatus.completed,
      note: 'billing ledger smoke completed',
    });

    const revenueEvent = await prisma.revenueEvent.findFirst({
      where: {
        tenantId: tenant.id,
        orderId: order.id,
        type: RevenueEventType.order_completed,
      },
    });
    assert(revenueEvent, 'Expected order_completed revenue event');
    assertDecimalEquals(revenueEvent.amount, '2000.00', 'Revenue event amount');
    report.revenueEventId = revenueEvent.id;

    const cycle = await billingCycleService.getOrCreateCurrentCycle({
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      now: new Date(),
    });

    const closed = await billingCycleService.closeCycleAndCreateDraftInvoice({
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      cycleId: cycle.id,
      planId: plan.id,
    });
    report.snapshotId = closed.usageSnapshotId;
    report.invoiceId = closed.invoice.id;

    const snapshot = await prisma.billingUsageSnapshot.findUniqueOrThrow({
      where: { id: closed.usageSnapshotId },
    });
    assertEquals(snapshot.source, 'ledger', 'Snapshot source');
    assert(snapshot.billingRuleVersionId, 'Snapshot must reference billing rule version');
    assert(snapshot.checksum, 'Snapshot must have checksum');
    assertDecimalEquals(snapshot.totalRevenue, '2000.00', 'Snapshot totalRevenue');
    assertEquals(snapshot.totalOrders, 1, 'Snapshot totalOrders');

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: closed.invoice.id },
    });
    assertEquals(invoice.usageSnapshotId, snapshot.id, 'Invoice usageSnapshotId');
    assertEquals(invoice.billingRuleVersionId, snapshot.billingRuleVersionId, 'Invoice billingRuleVersionId');
    assertEquals(invoice.status, InvoiceStatus.draft, 'Invoice initial status');

    await prisma.tenantBillingSubscription.update({
      where: { id: subscription.id },
      data: {
        status: TenantSubscriptionStatus.suspended,
        suspendedAt: new Date(),
      },
    });
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: TenantStatus.suspended },
    });

    const attempt = await paymentAttemptService.createAttemptForInvoice({
      invoiceId: invoice.id,
      tenantId: tenant.id,
      provider: PaymentProvider.mock,
      mode: BillingGatewayMode.sandbox,
      idempotencyKey: `billing-ledger-smoke:${invoice.id}`,
      simulate: 'pending',
    });
    report.paymentAttemptId = attempt.id;
    assertEquals(attempt.status, PaymentAttemptStatus.pending, 'Payment attempt initial status');

    await paymentAttemptService.markAttemptSucceeded({
      attemptId: attempt.id,
      reason: 'billing_ledger_smoke_confirmed',
    });

    const [paidInvoice, reactivatedSubscription, reactivatedTenant, history] = await Promise.all([
      prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.tenantBillingSubscription.findUniqueOrThrow({ where: { id: subscription.id } }),
      prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } }),
      prisma.subscriptionStatusHistory.findMany({
        where: { tenantId: tenant.id },
        orderBy: [{ createdAt: 'asc' }],
      }),
    ]);
    assertEquals(paidInvoice.status, InvoiceStatus.paid, 'Paid invoice status');
    assertEquals(reactivatedSubscription.status, TenantSubscriptionStatus.active, 'Reactivated subscription status');
    assertEquals(reactivatedTenant.status, TenantStatus.active, 'Reactivated tenant status');
    assert(history.some((entry) => entry.reason === 'subscription_created'), 'Missing subscription_created history');
    assert(history.some((entry) => entry.reason === 'payment_confirmed'), 'Missing payment_confirmed history');
    report.subscriptionHistoryIds = history.map((entry) => entry.id);

    report.auditEndpointMethods = assertAuditPermissionMetadata();

    const [auditEvents, auditSnapshots, auditHistory] = await Promise.all([
      revenueLedgerService.listEvents({ tenantId: tenant.id, take: 20 }),
      prisma.billingUsageSnapshot.findMany({ where: { tenantId: tenant.id } }),
      prisma.subscriptionStatusHistory.findMany({ where: { tenantId: tenant.id } }),
    ]);
    assert(auditEvents.some((event) => event.id === revenueEvent.id), 'Audit events must include revenue event');
    assert(auditSnapshots.some((item) => item.id === snapshot.id), 'Audit snapshots must include generated snapshot');
    assert(auditHistory.length >= 2, 'Audit history must include status entries');

    const health = await adminHealthService.getSystemHealth();
    assert(health.services.database.ok, 'Admin health database check failed');
    report.healthStatus = health.status;

    console.log('BILLING_LEDGER_SMOKE_GO', JSON.stringify(report, null, 2));
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
  console.error('BILLING_LEDGER_SMOKE_NO_GO');
  console.error(error);
  process.exit(1);
});
