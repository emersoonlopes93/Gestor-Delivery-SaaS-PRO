import { NotFoundException } from '@nestjs/common';
import { BillingGatewayMode, InvoiceStatus, PaymentAttemptStatus, PaymentProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { ManualBillingPaymentProvider } from '../src/billing/manual-billing-payment.provider';
import { MockBillingPaymentProvider } from '../src/billing/mock-billing-payment.provider';
import { AsaasBillingClientService } from '../src/billing/asaas-billing-client.service';
import { AsaasBillingPaymentProvider } from '../src/billing/asaas-billing-payment.provider';
import { BillingPaymentGatewayService } from '../src/billing/billing-payment-gateway.service';
import { TenantBillingResolverService } from '../src/billing/tenant-billing-resolver.service';
import { TenantBillingPortalService } from '../src/billing/tenant-billing-portal.service';
import { BillingSettingsService } from '../src/billing/billing-settings.service';
import { BillingRatingService } from '../src/billing/billing-rating.service';
import { BillingUsageService } from '../src/billing/billing-usage.service';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function buildGateway(): BillingPaymentGatewayService {
  return new BillingPaymentGatewayService(
    new ManualBillingPaymentProvider(),
    new MockBillingPaymentProvider(),
    new AsaasBillingPaymentProvider(new AsaasBillingClientService()),
  );
}

function buildPortal(prisma: PrismaService): TenantBillingPortalService {
  const gateway = buildGateway();
  const resolver = new TenantBillingResolverService(prisma, gateway);
  const settings = new BillingSettingsService(prisma);
  const rating = new BillingRatingService(prisma);
  const usage = new BillingUsageService(prisma, settings, rating);
  return new TenantBillingPortalService(prisma, resolver, usage, gateway);
}

async function main() {
  const prisma = new PrismaService(new TenantContextService());
  const resolver = new TenantBillingResolverService(prisma, buildGateway());
  const portal = buildPortal(prisma);
  await prisma.$connect();

  const createdTenantIds: string[] = [];
  const createdLegacyPlanIds: string[] = [];
  const runId = Date.now();

  try {
    const defaultPlan = await resolver.getDefaultBillingPlan();

    const tenantA = await prisma.tenant.create({
      data: {
        name: 'QA Tenant Billing Portal A',
        slug: `qa-billing-portal-a-${runId}`,
        status: 'active',
      },
    });
    createdTenantIds.push(tenantA.id);

    const tenantB = await prisma.tenant.create({
      data: {
        name: 'QA Tenant Billing Portal B',
        slug: `qa-billing-portal-b-${runId}`,
        status: 'active',
      },
    });
    createdTenantIds.push(tenantB.id);

    const subscriptionA = await resolver.getOrCreateTenantBillingSubscription(tenantA.id, defaultPlan.id);
    const subscriptionB = await resolver.getOrCreateTenantBillingSubscription(tenantB.id, defaultPlan.id);

    const cycleA = await prisma.billingCycleRecord.create({
      data: {
        tenantId: tenantA.id,
        subscriptionId: subscriptionA.id,
        startedAt: subscriptionA.currentCycleStartedAt ?? new Date(),
        endedAt: subscriptionA.currentCycleEndsAt,
        measuredRevenue: new Prisma.Decimal(1200),
        billableRevenue: new Prisma.Decimal(1200),
        baseAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(0),
        currency: 'BRL',
      },
    });

    const invoiceA = await prisma.invoice.create({
      data: {
        tenantId: tenantA.id,
        subscriptionId: subscriptionA.id,
        cycleId: cycleA.id,
        number: `QA-PORTAL-A-${runId}`,
        status: InvoiceStatus.open,
        subtotal: new Prisma.Decimal(120),
        total: new Prisma.Decimal(120),
        dueDate: new Date(Date.now() + 86400000),
        provider: PaymentProvider.manual,
        providerPaymentUrl: 'https://example.test/pay/tenant-a',
        items: {
          create: [{
            type: 'base',
            description: 'Mensalidade SaaS QA',
            quantity: 1,
            unitAmount: new Prisma.Decimal(120),
            totalAmount: new Prisma.Decimal(120),
          }],
        },
        paymentAttempts: {
          create: [{
            tenantId: tenantA.id,
            provider: PaymentProvider.manual,
            status: PaymentAttemptStatus.pending,
            mode: BillingGatewayMode.manual,
            amount: new Prisma.Decimal(120),
            idempotencyKey: `qa-portal-a-${runId}`,
          }],
        },
      },
    });

    await prisma.billingUsageSnapshot.create({
      data: {
        tenantId: tenantA.id,
        cycleId: cycleA.id,
        periodStart: subscriptionA.currentCycleStartedAt ?? new Date(),
        periodEnd: subscriptionA.currentCycleEndsAt ?? new Date(Date.now() + 86400000),
        sourceChannel: 'storefront,pos',
        ordersCount: 3,
        grossOrdersAmount: new Prisma.Decimal(1200),
        billableAmount: new Prisma.Decimal(1200),
      },
    });

    const cycleB = await prisma.billingCycleRecord.create({
      data: {
        tenantId: tenantB.id,
        subscriptionId: subscriptionB.id,
        startedAt: subscriptionB.currentCycleStartedAt ?? new Date(),
        endedAt: subscriptionB.currentCycleEndsAt,
        measuredRevenue: new Prisma.Decimal(2500),
        billableRevenue: new Prisma.Decimal(2500),
        baseAmount: new Prisma.Decimal(100),
        totalAmount: new Prisma.Decimal(100),
        currency: 'BRL',
      },
    });

    const invoiceB = await prisma.invoice.create({
      data: {
        tenantId: tenantB.id,
        subscriptionId: subscriptionB.id,
        cycleId: cycleB.id,
        number: `QA-PORTAL-B-${runId}`,
        status: InvoiceStatus.open,
        subtotal: new Prisma.Decimal(100),
        total: new Prisma.Decimal(100),
        dueDate: new Date(Date.now() + 86400000),
        provider: PaymentProvider.manual,
      },
    });

    const attemptsBefore = await prisma.paymentAttempt.count();

    const overview = await portal.getMyBillingOverview(tenantA.id);
    assert(overview.source === 'billing_v2', 'Overview não retornou source billing_v2.');
    assert(overview.subscription?.id === subscriptionA.id, 'Overview não retornou a assinatura do tenant autenticado.');
    assert(overview.plan?.id === defaultPlan.id, 'Overview não retornou o plano Billing V2.');
    assert(overview.usagePreview?.tenantId === tenantA.id, 'Overview não retornou usage do tenant autenticado.');
    assert(overview.paymentModeInfo.automaticBillingActive === false, 'Portal indicou cobrança automática ativa.');
    assert(overview.paymentModeInfo.paymentsEnabled === false, 'Portal expôs pagamentos como habilitados.');

    const invoicesA = await portal.listMyInvoices(tenantA.id);
    assert(invoicesA.some((invoice) => invoice.id === invoiceA.id), 'Lista não trouxe fatura do tenant A.');
    assert(!invoicesA.some((invoice) => invoice.id === invoiceB.id), 'Lista vazou fatura de outro tenant.');

    const detailA = await portal.getMyInvoiceDetails(tenantA.id, invoiceA.id);
    assert(detailA.invoice.id === invoiceA.id, 'Detalhe não retornou fatura solicitada.');
    assert(detailA.items.length === 1, 'Detalhe não retornou itens da fatura.');
    assert(detailA.snapshot?.tenantId === tenantA.id, 'Detalhe não retornou snapshot filtrado por tenant.');
    assert(detailA.paymentAttempts.every((attempt) => attempt.tenantId === tenantA.id), 'Detalhe vazou tentativa de pagamento.');

    let isolatedOtherTenant = false;
    try {
      await portal.getMyInvoiceDetails(tenantA.id, invoiceB.id);
    } catch (error) {
      isolatedOtherTenant = error instanceof NotFoundException;
    }
    assert(isolatedOtherTenant, 'Detalhe de fatura de outro tenant não retornou 404 seguro.');

    const attemptsAfterReads = await prisma.paymentAttempt.count();
    assert(attemptsAfterReads === attemptsBefore, 'Portal criou tentativa de pagamento durante leitura.');

    const legacyPlan = await prisma.plan.create({
      data: {
        name: 'QA Portal Legacy Plan',
        slug: `qa-portal-legacy-${runId}`,
        price: new Prisma.Decimal(49),
        billingCycle: 'monthly',
        features: { catalog: true },
        isActive: true,
      },
    });
    createdLegacyPlanIds.push(legacyPlan.id);

    const legacyTenant = await prisma.tenant.create({
      data: {
        name: 'QA Portal Legacy Tenant',
        slug: `qa-portal-legacy-tenant-${runId}`,
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

    const legacyOverview = await portal.getMyBillingOverview(legacyTenant.id);
    assert(legacyOverview.source === 'legacy_fallback', 'Fallback legado não respondeu com segurança.');
    assert(legacyOverview.subscription === null, 'Fallback legado não deve inventar TenantBillingSubscription.');
    assert(legacyOverview.usagePreview === null, 'Fallback legado não deve calcular usage Billing V2.');

    console.log('Tenant Billing Portal smoke passed:', {
      overviewSource: overview.source,
      tenantAInvoices: invoicesA.length,
      isolatedOtherTenant,
      paymentAttemptsUnchanged: attemptsBefore === attemptsAfterReads,
      legacySource: legacyOverview.source,
    });
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await prisma.plan.deleteMany({ where: { id: { in: createdLegacyPlanIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
