import { BillingPlan } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { BillingPlansService } from '../src/billing/billing-plans.service';
import { BillingRatingService } from '../src/billing/billing-rating.service';
import { BillingSettingsService } from '../src/billing/billing-settings.service';
import { BillingSubscriptionLifecycleService } from '../src/billing/billing-subscription-lifecycle.service';

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
  const prismaService = new PrismaService(tenantContext);
  await prismaService.$connect();

  const billingPlansService = new BillingPlansService(prismaService);
  const billingRatingService = new BillingRatingService(prismaService);
  const billingSettingsService = new BillingSettingsService(prismaService);
  const billingLifecycleService = new BillingSubscriptionLifecycleService();

  const defaultSettings = await billingSettingsService.ensureDefaultSettings();
  console.log('Default billing settings loaded:', {
    countStorefrontOrders: defaultSettings.countStorefrontOrders,
    countCompletedOrders: defaultSettings.countCompletedOrders,
    defaultTrialDays: defaultSettings.defaultTrialDays,
  });

  await ensureRevenueGrowthPlan(prismaService);

  const plans = await billingPlansService.listPlans(true);
  const revenuePlan = plans.find((plan) => plan.slug === 'revenue-growth');

  if (!revenuePlan) {
    throw new Error('Plano revenue-growth não encontrado');
  }

  console.log('Plano revenue-growth encontrado:', revenuePlan.id);

  const cases = [0, 1500, 1500.01, 4000, 4000.01, 6000, 6000.01];
  for (const value of cases) {
    const tier = await billingRatingService.selectRevenueTier(revenuePlan.id, value);
    console.log(`Revenue ${value} -> tier ${tier?.label} (${tier?.price})`);
    if (!tier) {
      throw new Error(`Nenhum tier encontrado para receita ${value}`);
    }
  }

  const active = billingLifecycleService.isSubscriptionActive('active');
  const trialing = billingLifecycleService.isSubscriptionActive('trialing');
  const gracePeriod = billingLifecycleService.isSubscriptionActive('grace_period');
  if (!active || !trialing || !gracePeriod) {
    throw new Error('Lifecycle helper returned estado inesperado');
  }

  console.log('Lifecycle helper returns expected values');

  await prismaService.$disconnect();
}

main().catch((error) => {
  console.error('Smoke test failed:', error);
  process.exit(1);
});
