import { PrismaService } from '../src/database/prisma.service';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { ManualBillingPaymentProvider } from '../src/billing/manual-billing-payment.provider';
import { MockBillingPaymentProvider } from '../src/billing/mock-billing-payment.provider';
import { AsaasBillingClientService } from '../src/billing/asaas-billing-client.service';
import { AsaasBillingPaymentProvider } from '../src/billing/asaas-billing-payment.provider';
import { BillingPaymentGatewayService } from '../src/billing/billing-payment-gateway.service';
import { TenantBillingResolverService } from '../src/billing/tenant-billing-resolver.service';
import { normalizeSeededRevenueTierLabel } from '../src/billing/revenue-tier-label';

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

  const summary = {
    tenantsAnalyzed: 0,
    created: 0,
    ignored: 0,
    errors: 0,
    tierLabelsNormalized: 0,
  };

  const plan = await resolver.getDefaultBillingPlan();
  const tiers = await prisma.billingRevenueTier.findMany({ where: { planId: plan.id } });
  for (const tier of tiers) {
    const normalized = normalizeSeededRevenueTierLabel(tier);
    if (normalized && normalized !== tier.label) {
      await prisma.billingRevenueTier.update({
        where: { id: tier.id },
        data: { label: normalized },
      });
      summary.tierLabelsNormalized += 1;
    }
  }

  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true },
    orderBy: [{ createdAt: 'asc' }],
  });

  summary.tenantsAnalyzed = tenants.length;

  for (const tenant of tenants) {
    try {
      const existing = await prisma.tenantBillingSubscription.findFirst({
        where: { tenantId: tenant.id },
        select: { id: true },
      });
      if (existing) {
        summary.ignored += 1;
        continue;
      }

      await resolver.getOrCreateTenantBillingSubscription(tenant.id, plan.id);
      summary.created += 1;
    } catch (error) {
      summary.errors += 1;
      console.error(`Erro ao migrar tenant ${tenant.slug}:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();

  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
