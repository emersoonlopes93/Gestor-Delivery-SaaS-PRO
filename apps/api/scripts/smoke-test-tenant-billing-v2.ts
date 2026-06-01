import { Prisma, TenantSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { ManualBillingPaymentProvider } from '../src/billing/manual-billing-payment.provider';
import { MockBillingPaymentProvider } from '../src/billing/mock-billing-payment.provider';
import { AsaasBillingClientService } from '../src/billing/asaas-billing-client.service';
import { AsaasBillingPaymentProvider } from '../src/billing/asaas-billing-payment.provider';
import { BillingPaymentGatewayService } from '../src/billing/billing-payment-gateway.service';
import { TenantBillingResolverService } from '../src/billing/tenant-billing-resolver.service';
import { normalizeSeededRevenueTierLabel } from '../src/billing/revenue-tier-label';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function buildResolver(prisma: PrismaService): TenantBillingResolverService {
  const gateway = new BillingPaymentGatewayService(
    new ManualBillingPaymentProvider(),
    new MockBillingPaymentProvider(),
    new AsaasBillingPaymentProvider(new AsaasBillingClientService()),
  );
  return new TenantBillingResolverService(prisma, gateway);
}

async function main() {
  const prisma = new PrismaService(new TenantContextService());
  const resolver = buildResolver(prisma);
  await prisma.$connect();

  const createdTenantIds: string[] = [];
  const createdPlanIds: string[] = [];

  try {
    const defaultPlan = await resolver.getDefaultBillingPlan();
    assert(defaultPlan.slug === 'revenue-growth' || defaultPlan.isPublic, 'Plano default Billing V2 inválido.');

    const tenant = await prisma.tenant.create({
      data: {
        name: 'QA Tenant Billing V2 Smoke',
        slug: `qa-billing-v2-${Date.now()}`,
        status: 'trial',
      },
    });
    createdTenantIds.push(tenant.id);

    const first = await resolver.getOrCreateTenantBillingSubscription(tenant.id, defaultPlan.id);
    const second = await resolver.getOrCreateTenantBillingSubscription(tenant.id, defaultPlan.id);
    assert(first.id === second.id, 'Criação idempotente duplicou assinatura.');

    const count = await prisma.tenantBillingSubscription.count({ where: { tenantId: tenant.id } });
    assert(count === 1, 'Tenant recebeu mais de uma TenantBillingSubscription.');

    const expectedStatus = defaultPlan.trialDays > 0 ? TenantSubscriptionStatus.trialing : TenantSubscriptionStatus.active;
    assert(first.status === expectedStatus, 'Status inicial não segue trialDays do plano.');

    const state = await resolver.getTenantBillingState(tenant.id);
    assert(state.source === 'billing_v2', 'Resolver não retornou source billing_v2.');
    assert(state.hasBillingV2, 'Resolver não marcou hasBillingV2.');

    const modules = await resolver.resolveTenantEntitlements(tenant.id);
    if (defaultPlan.allowAllModules) {
      assert(modules.allowAllModules && modules.includedModules.includes('catalog'), 'allowAllModules não liberou módulos principais.');
    }

    const activePlan = await prisma.billingPlan.create({
      data: {
        name: 'QA Active No Trial',
        slug: `qa-active-no-trial-${Date.now()}`,
        description: 'Plano temporário para smoke Billing V2.',
        type: 'revenue_tiered',
        cycleInterval: 'monthly',
        isActive: true,
        isPublic: false,
        trialDays: 0,
        requiresPaymentMethod: false,
        allowAllModules: true,
        revenueTiers: {
          create: [{
            minRevenue: new Prisma.Decimal(0),
            maxRevenue: null,
            price: new Prisma.Decimal(0),
            label: 'Acima de R$ 0',
            sortOrder: 0,
          }],
        },
      },
    });
    createdPlanIds.push(activePlan.id);

    const activeTenant = await prisma.tenant.create({
      data: {
        name: 'QA Tenant Billing V2 Active',
        slug: `qa-billing-v2-active-${Date.now()}`,
        status: 'active',
      },
    });
    createdTenantIds.push(activeTenant.id);

    const activeSub = await resolver.getOrCreateTenantBillingSubscription(activeTenant.id, activePlan.id);
    assert(activeSub.status === TenantSubscriptionStatus.active, 'Plano sem trialDays não iniciou como active.');

    const legacyPlan = await prisma.plan.create({
      data: {
        name: 'QA Legacy Plan',
        slug: `qa-legacy-${Date.now()}`,
        price: new Prisma.Decimal(99),
        billingCycle: 'monthly',
        features: { catalog: true },
        isActive: true,
      },
    });

    const legacyTenant = await prisma.tenant.create({
      data: {
        name: 'QA Legacy Fallback',
        slug: `qa-legacy-fallback-${Date.now()}`,
        status: 'trial',
        subscription: {
          create: {
            planId: legacyPlan.id,
            status: 'trial',
            trialEndsAt: new Date(Date.now() + 86400000),
            currentPeriodStartsAt: new Date(),
            currentPeriodEndsAt: new Date(Date.now() + 86400000),
          },
        },
      },
    });
    createdTenantIds.push(legacyTenant.id);

    const legacyState = await resolver.getTenantBillingState(legacyTenant.id);
    assert(legacyState.source === 'legacy_fallback', 'Tenant legado sem Billing V2 não usou fallback.');

    const beforeMigration = await prisma.tenantBillingSubscription.count({ where: { tenantId: legacyTenant.id } });
    await resolver.getOrCreateTenantBillingSubscription(legacyTenant.id, defaultPlan.id);
    await resolver.getOrCreateTenantBillingSubscription(legacyTenant.id, defaultPlan.id);
    const afterMigration = await prisma.tenantBillingSubscription.count({ where: { tenantId: legacyTenant.id } });
    assert(beforeMigration === 0 && afterMigration === 1, 'Migração idempotente não criou exatamente uma assinatura.');

    const tiers = await prisma.billingRevenueTier.findMany({ where: { planId: defaultPlan.id } });
    const invalidLabel = tiers.find((tier) => {
      const normalized = normalizeSeededRevenueTierLabel(tier);
      return normalized !== null && /Ate| ate |Ã/.test(normalized);
    });
    assert(!invalidLabel, 'Labels de tiers ainda exibem mojibake ou acento ausente.');

    console.log('Tenant Billing V2 smoke passed:', {
      defaultPlanId: defaultPlan.id,
      tenantSubscriptionId: first.id,
      activeSubscriptionId: activeSub.id,
      legacyFallbackSource: legacyState.source,
    });

    await prisma.plan.delete({ where: { id: legacyPlan.id } });
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await prisma.billingPlan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
