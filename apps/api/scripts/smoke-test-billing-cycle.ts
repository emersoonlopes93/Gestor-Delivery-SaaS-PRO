import {
  BillingPlan,
  InvoiceStatus,
  OrderStatus,
  Prisma,
  TenantSubscriptionStatus,
} from '@prisma/client';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { PrismaService } from '../src/database/prisma.service';
import { BillingCycleService } from '../src/billing/billing-cycle.service';
import { BillingRatingService } from '../src/billing/billing-rating.service';
import { BillingSettingsService } from '../src/billing/billing-settings.service';
import { BillingUsageService } from '../src/billing/billing-usage.service';
import { InvoiceService } from '../src/billing/invoice.service';

type TestOrderInput = {
  tenantId: string;
  orderNumber: string;
  status: OrderStatus;
  sourceChannel: string;
  itemsSubtotal: string;
  discountTotal?: string;
  deliveryFee?: string;
  serviceFee?: string;
  createdAt: Date;
};

const periodStart = new Date('2026-05-01T00:00:00.000Z');
const periodEnd = new Date('2026-06-01T00:00:00.000Z');
const cycleNow = new Date('2026-05-15T12:00:00.000Z');

function assertDecimalEquals(actual: Prisma.Decimal, expected: string, label: string): void {
  const expectedDecimal = new Prisma.Decimal(expected);
  if (!actual.equals(expectedDecimal)) {
    throw new Error(`${label}: expected ${expectedDecimal.toFixed(2)}, got ${actual.toFixed(2)}`);
  }
}

function assertNumberEquals(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertStringEquals(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function createTenant(prisma: PrismaService) {
  const slug = `billing-cycle-${Date.now()}`;
  return prisma.tenant.create({
    data: {
      name: 'Billing Cycle Smoke',
      slug,
    },
  });
}

async function createOrder(prisma: PrismaService, input: TestOrderInput): Promise<void> {
  const itemsSubtotal = new Prisma.Decimal(input.itemsSubtotal);
  const discountTotal = new Prisma.Decimal(input.discountTotal ?? 0);
  const deliveryFee = new Prisma.Decimal(input.deliveryFee ?? 0);
  const serviceFee = new Prisma.Decimal(input.serviceFee ?? 0);
  const total = itemsSubtotal.minus(discountTotal).plus(deliveryFee).plus(serviceFee);

  await prisma.order.create({
    data: {
      tenantId: input.tenantId,
      orderNumber: input.orderNumber,
      status: input.status,
      fulfillmentType: 'delivery',
      customerName: 'Cliente Billing Cycle Smoke',
      customerPhone: '11999999999',
      itemsSubtotal,
      discountTotal,
      deliveryFee,
      serviceFee,
      total,
      sourceChannel: input.sourceChannel,
      idempotencyKey: `${input.tenantId}-${input.orderNumber}`,
      paymentMethod: 'cash',
      publicTrackingToken: `${input.tenantId}-${input.orderNumber}-tracking`,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
}

async function ensureRevenueGrowthPlan(prisma: PrismaService): Promise<BillingPlan> {
  const plan = await prisma.billingPlan.upsert({
    where: { slug: 'revenue-growth' },
    update: {
      name: 'Crescimento por Faturamento',
      description: 'Plano novo para faturamento por receita mensal',
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
      description: 'Plano novo para faturamento por receita mensal',
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

  const tiers = [
    { minRevenue: 0, maxRevenue: 1500, price: 0, label: 'Ate R$ 1.500', sortOrder: 0 },
    { minRevenue: 1500.01, maxRevenue: 4000, price: 100, label: 'R$ 1.500,01 ate R$ 4.000', sortOrder: 1 },
    { minRevenue: 4000.01, maxRevenue: 6000, price: 200, label: 'R$ 4.000,01 ate R$ 6.000', sortOrder: 2 },
    { minRevenue: 6000.01, maxRevenue: null, price: 300, label: 'Acima de R$ 6.000', sortOrder: 3 },
  ];

  for (const tier of tiers) {
    await prisma.billingRevenueTier.upsert({
      where: {
        planId_sortOrder: {
          planId: plan.id,
          sortOrder: tier.sortOrder,
        },
      },
      update: {
        minRevenue: tier.minRevenue,
        maxRevenue: tier.maxRevenue,
        price: tier.price,
        label: tier.label,
      },
      create: {
        planId: plan.id,
        minRevenue: tier.minRevenue,
        maxRevenue: tier.maxRevenue,
        price: tier.price,
        label: tier.label,
        sortOrder: tier.sortOrder,
      },
    });
  }

  return plan;
}

async function main() {
  const tenantContext = new TenantContextService();
  const prisma = new PrismaService(tenantContext);
  await prisma.$connect();

  const billingSettingsService = new BillingSettingsService(prisma);
  const billingRatingService = new BillingRatingService(prisma);
  const billingUsageService = new BillingUsageService(
    prisma,
    billingSettingsService,
    billingRatingService,
  );
  const invoiceService = new InvoiceService(prisma, billingRatingService);
  const billingCycleService = new BillingCycleService(prisma, billingUsageService, invoiceService);

  let tenantId: string | null = null;

  try {
    await billingSettingsService.ensureDefaultSettings();
    const plan = await ensureRevenueGrowthPlan(prisma);
    const tenant = await createTenant(prisma);
    tenantId = tenant.id;

    const subscription = await prisma.tenantBillingSubscription.create({
      data: {
        tenantId: tenant.id,
        billingPlanId: plan.id,
        status: TenantSubscriptionStatus.active,
        startedAt: periodStart,
        currentCycleStartedAt: periodStart,
        currentCycleEndsAt: periodEnd,
        requiresPaymentMethod: false,
      },
    });

    await createOrder(prisma, {
      tenantId: tenant.id,
      orderNumber: '#0001',
      status: OrderStatus.confirmed,
      sourceChannel: 'storefront',
      itemsSubtotal: '1000.00',
      discountTotal: '100.00',
      createdAt: new Date('2026-05-10T12:00:00.000Z'),
    });
    await createOrder(prisma, {
      tenantId: tenant.id,
      orderNumber: '#0002',
      status: OrderStatus.completed,
      sourceChannel: 'pos',
      itemsSubtotal: '750.00',
      createdAt: new Date('2026-05-11T12:00:00.000Z'),
    });

    const cycle1 = await billingCycleService.getOrCreateCurrentCycle({
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      now: cycleNow,
    });
    const cycle2 = await billingCycleService.getOrCreateCurrentCycle({
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      now: cycleNow,
    });
    assertStringEquals(cycle2.id, cycle1.id, 'Current cycle must be idempotent');

    const preview = await billingCycleService.previewCycleInvoice({
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      cycleId: cycle1.id,
      planId: plan.id,
    });
    assertDecimalEquals(preview.usage.billableAmount, '1650.00', 'Preview billable revenue');
    assertDecimalEquals(preview.totalAmount, '100.00', 'Preview draft invoice total');
    assertNumberEquals(preview.invoiceItems.length, 1, 'Preview invoice item count');

    assertNumberEquals(
      await prisma.billingUsageSnapshot.count({ where: { tenantId: tenant.id, cycleId: cycle1.id } }),
      0,
      'Preview must not persist usage snapshots',
    );
    assertNumberEquals(
      await prisma.invoice.count({ where: { tenantId: tenant.id, subscriptionId: subscription.id, cycleId: cycle1.id } }),
      0,
      'Preview must not persist invoices',
    );

    const result1 = await billingCycleService.closeCycleAndCreateDraftInvoice({
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      cycleId: cycle1.id,
      planId: plan.id,
    });
    assertStringEquals(result1.cycle.status, 'invoiced', 'Closed cycle status');
    assertStringEquals(result1.invoice.status, InvoiceStatus.draft, 'Invoice must be draft');
    assertDecimalEquals(result1.invoice.total, '100.00', 'Draft invoice total');

    assertNumberEquals(
      await prisma.billingCycleRecord.count({ where: { tenantId: tenant.id, subscriptionId: subscription.id } }),
      1,
      'Only one cycle should exist',
    );
    assertNumberEquals(
      await prisma.billingUsageSnapshot.count({ where: { tenantId: tenant.id, cycleId: cycle1.id } }),
      1,
      'Only one usage snapshot should exist',
    );
    assertNumberEquals(
      await prisma.invoice.count({ where: { tenantId: tenant.id, subscriptionId: subscription.id, cycleId: cycle1.id } }),
      1,
      'Only one invoice should exist',
    );
    assertNumberEquals(
      await prisma.invoiceItem.count({ where: { invoiceId: result1.invoice.id } }),
      1,
      'Only one invoice item should exist',
    );
    assertNumberEquals(
      await prisma.paymentAttempt.count({ where: { tenantId: tenant.id, invoiceId: result1.invoice.id } }),
      0,
      'Draft invoice creation must not create payment attempts',
    );

    const result2 = await billingCycleService.closeCycleAndCreateDraftInvoice({
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      cycleId: cycle1.id,
      planId: plan.id,
    });
    assertStringEquals(result2.invoice.id, result1.invoice.id, 'Second close must reuse invoice');
    assertStringEquals(result2.usageSnapshotId, result1.usageSnapshotId, 'Second close must reuse snapshot');

    assertNumberEquals(
      await prisma.billingUsageSnapshot.count({ where: { tenantId: tenant.id, cycleId: cycle1.id } }),
      1,
      'Idempotent close must not duplicate snapshots',
    );
    assertNumberEquals(
      await prisma.invoice.count({ where: { tenantId: tenant.id, subscriptionId: subscription.id, cycleId: cycle1.id } }),
      1,
      'Idempotent close must not duplicate invoices',
    );
    assertNumberEquals(
      await prisma.invoiceItem.count({ where: { invoiceId: result1.invoice.id } }),
      1,
      'Idempotent close must not duplicate invoice items',
    );

    console.log('Billing cycle smoke passed:', {
      cycleId: cycle1.id,
      invoiceId: result1.invoice.id,
      snapshotId: result1.usageSnapshotId,
      invoiceTotal: result1.invoice.total.toFixed(2),
    });
  } finally {
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Billing cycle smoke failed:', error);
  process.exit(1);
});
