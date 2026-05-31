import { BillingPlan, OrderStatus, Prisma } from '@prisma/client';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { PrismaService } from '../src/database/prisma.service';
import { BillingRatingService } from '../src/billing/billing-rating.service';
import { BillingSettingsService } from '../src/billing/billing-settings.service';
import { BillingUsageService } from '../src/billing/billing-usage.service';

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

function assertDecimalEquals(actual: Prisma.Decimal, expected: string, label: string): void {
  const expectedDecimal = new Prisma.Decimal(expected);
  if (!actual.equals(expectedDecimal)) {
    throw new Error(`${label}: esperado ${expectedDecimal.toFixed(2)}, recebido ${actual.toFixed(2)}`);
  }
}

function assertNumberEquals(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${expected}, recebido ${actual}`);
  }
}

async function createTenant(prisma: PrismaService, slugSuffix: string) {
  const slug = `billing-usage-${slugSuffix}-${Date.now()}`;
  return prisma.tenant.create({
    data: {
      name: `Billing Usage ${slugSuffix}`,
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
      customerName: 'Cliente Billing Smoke',
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
    { minRevenue: 0, maxRevenue: 1500, price: 0, label: 'Até R$ 1.500', sortOrder: 0 },
    { minRevenue: 1500.01, maxRevenue: 4000, price: 100, label: 'R$ 1.500,01 até R$ 4.000', sortOrder: 1 },
    { minRevenue: 4000.01, maxRevenue: 6000, price: 200, label: 'R$ 4.000,01 até R$ 6.000', sortOrder: 2 },
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

  const createdTenantIds: string[] = [];

  try {
    const settings = await billingSettingsService.ensureDefaultSettings();
    const plan = await ensureRevenueGrowthPlan(prisma);

    const emptyTenant = await createTenant(prisma, 'empty');
    createdTenantIds.push(emptyTenant.id);

    const emptyPreview = await billingUsageService.getBillableRevenuePreview({
      tenantId: emptyTenant.id,
      periodStart,
      periodEnd,
      planId: plan.id,
    });
    assertDecimalEquals(emptyPreview.billableAmount, '0', 'Sem pedidos deve faturar zero');
    assertDecimalEquals(emptyPreview.rating?.currentMonthlyPrice ?? new Prisma.Decimal(-1), '0', 'Tier grátis em zero');

    const tierLimitTenant = await createTenant(prisma, 'tier-limit');
    createdTenantIds.push(tierLimitTenant.id);
    await createOrder(prisma, {
      tenantId: tierLimitTenant.id,
      orderNumber: '#0001',
      status: OrderStatus.confirmed,
      sourceChannel: 'storefront',
      itemsSubtotal: '1500.00',
      createdAt: new Date('2026-05-10T12:00:00.000Z'),
    });
    const tierLimitPreview = await billingUsageService.getBillableRevenuePreview({
      tenantId: tierLimitTenant.id,
      periodStart,
      periodEnd,
      planId: plan.id,
    });
    assertDecimalEquals(tierLimitPreview.billableAmount, '1500.00', 'R$ 1.500 deve contar exato');
    assertDecimalEquals(tierLimitPreview.rating?.currentMonthlyPrice ?? new Prisma.Decimal(-1), '0', 'R$ 1.500 ainda é grátis');

    const paidTenant = await createTenant(prisma, 'paid');
    createdTenantIds.push(paidTenant.id);
    await createOrder(prisma, {
      tenantId: paidTenant.id,
      orderNumber: '#0001',
      status: OrderStatus.confirmed,
      sourceChannel: 'storefront',
      itemsSubtotal: '1500.01',
      createdAt: new Date('2026-05-10T12:00:00.000Z'),
    });
    const paidPreview = await billingUsageService.getBillableRevenuePreview({
      tenantId: paidTenant.id,
      periodStart,
      periodEnd,
      planId: plan.id,
    });
    assertDecimalEquals(paidPreview.billableAmount, '1500.01', 'R$ 1.500,01 deve contar exato');
    assertDecimalEquals(paidPreview.rating?.currentMonthlyPrice ?? new Prisma.Decimal(-1), '100', 'R$ 1.500,01 deve ir para R$ 100');

    const mixedTenant = await createTenant(prisma, 'mixed');
    createdTenantIds.push(mixedTenant.id);
    await createOrder(prisma, {
      tenantId: mixedTenant.id,
      orderNumber: '#0001',
      status: OrderStatus.confirmed,
      sourceChannel: 'storefront',
      itemsSubtotal: '1000.00',
      discountTotal: '100.00',
      deliveryFee: '20.00',
      serviceFee: '5.00',
      createdAt: new Date('2026-05-10T12:00:00.000Z'),
    });
    await createOrder(prisma, {
      tenantId: mixedTenant.id,
      orderNumber: '#0002',
      status: OrderStatus.completed,
      sourceChannel: 'pos',
      itemsSubtotal: '500.00',
      createdAt: new Date('2026-05-11T12:00:00.000Z'),
    });
    await createOrder(prisma, {
      tenantId: mixedTenant.id,
      orderNumber: '#0003',
      status: OrderStatus.confirmed,
      sourceChannel: 'whatsapp_ai',
      itemsSubtotal: '250.00',
      createdAt: new Date('2026-05-12T12:00:00.000Z'),
    });
    await createOrder(prisma, {
      tenantId: mixedTenant.id,
      orderNumber: '#0004',
      status: OrderStatus.cancelled,
      sourceChannel: 'storefront',
      itemsSubtotal: '999.00',
      createdAt: new Date('2026-05-13T12:00:00.000Z'),
    });
    await createOrder(prisma, {
      tenantId: mixedTenant.id,
      orderNumber: '#0005',
      status: OrderStatus.draft,
      sourceChannel: 'storefront',
      itemsSubtotal: '999.00',
      createdAt: new Date('2026-05-14T12:00:00.000Z'),
    });
    await createOrder(prisma, {
      tenantId: mixedTenant.id,
      orderNumber: '#0006',
      status: OrderStatus.confirmed,
      sourceChannel: 'manual',
      itemsSubtotal: '999.00',
      createdAt: new Date('2026-05-15T12:00:00.000Z'),
    });

    const mixedPreview = await billingUsageService.getBillableRevenuePreview({
      tenantId: mixedTenant.id,
      periodStart,
      periodEnd,
      planId: plan.id,
    });
    assertNumberEquals(mixedPreview.ordersCount, 3, 'Somente confirmed/completed e canais padrão contam');
    assertNumberEquals(mixedPreview.excludedOrdersCount, 3, 'Cancelado, draft e manual ficam fora por padrão');
    assertDecimalEquals(mixedPreview.billableAmount, '1650.00', 'Desconto reduz e taxas não contam por padrão');
    assertDecimalEquals(mixedPreview.deliveryFeeAmount, '20.00', 'Delivery fee é somado separadamente');
    assertDecimalEquals(mixedPreview.serviceFeeAmount, '5.00', 'Service fee é somado separadamente');

    const noPosPreview = await billingUsageService.getBillableRevenuePreview({
      tenantId: mixedTenant.id,
      periodStart,
      periodEnd,
      settings: { ...settings, countPosOrders: false },
      planId: plan.id,
    });
    assertNumberEquals(noPosPreview.ordersCount, 2, 'Canal desativado não conta');
    assertDecimalEquals(noPosPreview.billableAmount, '1150.00', 'POS removido do faturamento');

    const withFeesPreview = await billingUsageService.getBillableRevenuePreview({
      tenantId: mixedTenant.id,
      periodStart,
      periodEnd,
      settings: {
        ...settings,
        includeDeliveryFeeByDefault: true,
        includeServiceFeeByDefault: true,
      },
      planId: plan.id,
    });
    assertDecimalEquals(withFeesPreview.billableAmount, '1675.00', 'Delivery e service fee contam quando configurados');

    const snapshot = await billingUsageService.createUsageSnapshot({
      tenantId: mixedTenant.id,
      periodStart,
      periodEnd,
      planId: plan.id,
    });
    assertDecimalEquals(snapshot.billableAmount, '1650.00', 'Snapshot persiste billableAmount calculado');

    console.log('Billing usage smoke passed:', {
      planId: plan.id,
      emptyBillable: emptyPreview.billableAmount.toFixed(2),
      mixedBillable: mixedPreview.billableAmount.toFixed(2),
      selectedTierPrice: mixedPreview.rating?.currentMonthlyPrice.toFixed(2),
      snapshotId: snapshot.id,
    });
  } finally {
    for (const tenantId of createdTenantIds.reverse()) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Billing usage smoke failed:', error);
  process.exit(1);
});
