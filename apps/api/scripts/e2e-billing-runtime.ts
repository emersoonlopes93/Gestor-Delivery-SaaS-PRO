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

async function createTenant(prisma: PrismaService, name: string) {
  const slug = `billing-e2e-${name.toLowerCase().replace(' ', '-')}-${Date.now()}`;
  return prisma.tenant.create({
    data: { name, slug },
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
      customerName: 'Cliente E2E',
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
    where: { slug: 'revenue-growth-e2e' },
    update: {
      name: 'E2E Faturamento',
      description: 'Plano E2E',
      type: 'revenue_tiered',
      cycleInterval: 'monthly',
      isActive: true,
      isPublic: false,
      currency: 'BRL',
      trialDays: 0,
      requiresPaymentMethod: false,
      allowAllModules: true,
    },
    create: {
      name: 'E2E Faturamento',
      slug: 'revenue-growth-e2e',
      description: 'Plano E2E',
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

async function simulateTenant(
  name: string,
  faturamento: string,
  expectedFatura: string,
  services: any,
  prisma: PrismaService,
  plan: BillingPlan
) {
  const { billingSettingsService, billingCycleService } = services;
  
  const tenant = await createTenant(prisma, name);
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

  // Criar pedido que GERA faturamento
  await createOrder(prisma, {
    tenantId: tenant.id,
    orderNumber: '#F001',
    status: OrderStatus.completed, // Completo DEVE contar
    sourceChannel: 'storefront',
    itemsSubtotal: faturamento,
    createdAt: new Date('2026-05-10T12:00:00.000Z'),
  });

  // Criar pedido cancelado (NÃO DEVE CONTAR)
  await createOrder(prisma, {
    tenantId: tenant.id,
    orderNumber: '#C001',
    status: OrderStatus.cancelled,
    sourceChannel: 'storefront',
    itemsSubtotal: '9999.00',
    createdAt: new Date('2026-05-11T12:00:00.000Z'),
  });

  // Criar pedido expirado/recusado (não deve contar se a regra diz que só completado/confirmado)
  await createOrder(prisma, {
    tenantId: tenant.id,
    orderNumber: '#E001',
    status: OrderStatus.cancelled,
    sourceChannel: 'storefront',
    itemsSubtotal: '9999.00',
    createdAt: new Date('2026-05-12T12:00:00.000Z'),
  });

  const cycle = await billingCycleService.getOrCreateCurrentCycle({
    tenantId: tenant.id,
    subscriptionId: subscription.id,
    now: cycleNow,
  });

  const result = await billingCycleService.closeCycleAndCreateDraftInvoice({
    tenantId: tenant.id,
    subscriptionId: subscription.id,
    cycleId: cycle.id,
    planId: plan.id,
  });

  console.log(`[${name}] Faturamento Gerado: ${result.cycle.billableRevenue} | Esperado Fatura: ${expectedFatura} | Fatura: ${result.invoice.total}`);
  
  assertDecimalEquals(result.cycle.billableRevenue, faturamento, `[${name}] Billable Revenue`);
  assertDecimalEquals(result.invoice.total, expectedFatura, `[${name}] Invoice Total`);

  return tenant.id;
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

  const services = { billingSettingsService, billingCycleService };
  const createdTenantIds: string[] = [];

  try {
    await billingSettingsService.ensureDefaultSettings();
    const plan = await ensureRevenueGrowthPlan(prisma);

    // Tenant A - faturamento R$ 800 (Até R$ 1.500 -> Gratuito 0)
    createdTenantIds.push(await simulateTenant('Tenant A', '800.00', '0.00', services, prisma, plan));
    
    // Tenant B - faturamento R$ 2.500 (R$ 1.500 até R$ 4.000 -> 100)
    createdTenantIds.push(await simulateTenant('Tenant B', '2500.00', '100.00', services, prisma, plan));
    
    // Tenant C - faturamento R$ 5.000 (R$ 4.000 até R$ 6.000 -> 200)
    createdTenantIds.push(await simulateTenant('Tenant C', '5000.00', '200.00', services, prisma, plan));
    
    // Tenant D - faturamento R$ 10.000 (Acima de R$ 6.000 -> 300)
    createdTenantIds.push(await simulateTenant('Tenant D', '10000.00', '300.00', services, prisma, plan));
    
    // Tenant E - faturamento R$ 20.000 (Acima de R$ 6.000 -> 300)
    createdTenantIds.push(await simulateTenant('Tenant E', '20000.00', '300.00', services, prisma, plan));

    console.log('✅ PASS: Todas as simulações executadas com sucesso. Valores conferem com a faixa de faturamento e regras de multitenancy!');

  } finally {
    // Delete tenants to clean up
    for (const id of createdTenantIds) {
      await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('❌ FAIL: Simulação falhou!', error);
  process.exit(1);
});
