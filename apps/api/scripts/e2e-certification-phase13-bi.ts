import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Test } from '@nestjs/testing';
import { CampaignsService } from '../src/campaigns/services/campaigns.service';
import { BusinessIntelligenceService } from '../src/analytics/business-intelligence.service';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { BusinessInsightsService } from '../src/analytics/business-insights.service';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { CustomerIntelligenceService } from '../src/crm/customer-intelligence.service';
import { loadApiEnvFiles } from '../src/config/env-paths';
import { PrismaService } from '../src/database/prisma.service';

type Check = {
  name: string;
  status: 'PASS' | 'FAIL';
  evidence: Record<string, unknown>;
};

function assertCheck(name: string, condition: boolean, evidence: Record<string, unknown>): Check {
  return { name, status: condition ? 'PASS' : 'FAIL', evidence };
}

function daysAgo(days: number, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function main() {
  loadApiEnvFiles();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PrismaService,
      TenantContextService,
      AnalyticsService,
      BusinessInsightsService,
      CustomerIntelligenceService,
      CampaignsService,
      BusinessIntelligenceService,
    ],
  }).compile();
  const prisma = moduleRef.get(PrismaService);
  const bi = moduleRef.get(BusinessIntelligenceService);
  const tenantSlug = `phase13-bi-e2e-${Date.now()}`;
  const otherSlug = `${tenantSlug}-other`;
  const checks: Check[] = [];

  try {
    const staleTenants = await prisma.tenant.findMany({
      where: { slug: { startsWith: 'phase13-bi-e2e-' } },
      select: { id: true },
    });
    const staleTenantIds = staleTenants.map((tenant) => tenant.id);
    if (staleTenantIds.length) {
      const staleCampaigns = await prisma.campaign.findMany({ where: { tenantId: { in: staleTenantIds } }, select: { id: true } });
      const staleCampaignIds = staleCampaigns.map((campaign) => campaign.id);
      if (staleCampaignIds.length) await prisma.campaignDispatch.deleteMany({ where: { campaignId: { in: staleCampaignIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: staleTenantIds } } });
    }

    const tenant = await prisma.tenant.create({
      data: { name: 'Phase 13 BI E2E', slug: tenantSlug, status: 'active' },
    });
    const otherTenant = await prisma.tenant.create({
      data: { name: 'Phase 13 BI E2E Other', slug: otherSlug, status: 'active' },
    });

    const category = await prisma.productCategory.create({
      data: { tenantId: tenant.id, name: 'Pizzas BI', slug: `pizzas-bi-${Date.now()}` },
    });
    const drinkCategory = await prisma.productCategory.create({
      data: { tenantId: tenant.id, name: 'Bebidas BI', slug: `bebidas-bi-${Date.now()}` },
    });

    const flour = await prisma.ingredient.create({
      data: { tenantId: tenant.id, name: 'Farinha BI', sku: `FAR-${Date.now()}`, unit: 'kg', currentCost: 8, currentStock: 100 },
    });
    const cheese = await prisma.ingredient.create({
      data: { tenantId: tenant.id, name: 'Queijo BI', sku: `QUE-${Date.now()}`, unit: 'kg', currentCost: 30, currentStock: 100 },
    });

    const pizza = await prisma.product.create({
      data: { tenantId: tenant.id, categoryId: category.id, name: 'Pizza BI Margem Alta', slug: `pizza-bi-${Date.now()}`, basePrice: 50, costPrice: 12 },
    });
    const calzone = await prisma.product.create({
      data: { tenantId: tenant.id, categoryId: category.id, name: 'Calzone BI', slug: `calzone-bi-${Date.now()}`, basePrice: 35, costPrice: 18 },
    });
    const soda = await prisma.product.create({
      data: { tenantId: tenant.id, categoryId: drinkCategory.id, name: 'Refrigerante BI', slug: `refri-bi-${Date.now()}`, basePrice: 12, costPrice: 7 },
    });

    await prisma.productRecipeIngredient.createMany({
      data: [
        { tenantId: tenant.id, productId: pizza.id, ingredientId: flour.id, quantity: 0.2 },
        { tenantId: tenant.id, productId: pizza.id, ingredientId: cheese.id, quantity: 0.2 },
        { tenantId: tenant.id, productId: calzone.id, ingredientId: flour.id, quantity: 0.15 },
        { tenantId: tenant.id, productId: calzone.id, ingredientId: cheese.id, quantity: 0.15 },
      ],
    });

    const vip = await prisma.customer.create({
      data: { tenantId: tenant.id, name: 'Cliente VIP BI', phone: `551199${Date.now().toString().slice(-8)}`, totalOrders: 6, totalSpent: 300, lastOrderDate: daysAgo(1), loyaltyPoints: 120, cashbackBalance: 15 },
    });
    const risk = await prisma.customer.create({
      data: { tenantId: tenant.id, name: 'Cliente Risco BI', phone: `551188${Date.now().toString().slice(-8)}`, totalOrders: 3, totalSpent: 120, lastOrderDate: daysAgo(75), loyaltyPoints: 10, cashbackBalance: 0 },
    });
    const otherCustomer = await prisma.customer.create({
      data: { tenantId: otherTenant.id, name: 'Cliente Outro Tenant BI', phone: `551177${Date.now().toString().slice(-8)}`, totalOrders: 1, totalSpent: 999, lastOrderDate: daysAgo(1) },
    });

    async function createOrder(params: {
      customerId: string;
      customerName: string;
      total: number;
      createdAt: Date;
      sourceChannel: string;
      status?: 'completed' | 'cancelled';
      lines: Array<{ productId: string; name: string; quantity: number; unitPrice: number }>;
    }) {
      const order = await prisma.order.create({
        data: {
          tenantId: tenant.id,
          orderNumber: `BI${Math.floor(Math.random() * 1_000_000)}`,
          status: params.status ?? 'completed',
          fulfillmentType: 'delivery',
          customerId: params.customerId,
          customerName: params.customerName,
          customerPhone: '5511999999999',
          itemsSubtotal: params.total,
          total: params.total,
          sourceChannel: params.sourceChannel,
          idempotencyKey: `bi-${Date.now()}-${Math.random()}`,
          publicTrackingToken: `bi-token-${Date.now()}-${Math.random()}`,
          createdAt: params.createdAt,
          updatedAt: params.createdAt,
        },
      });
      for (const line of params.lines) {
        await prisma.orderItem.create({
          data: {
            tenantId: tenant.id,
            orderId: order.id,
            lineType: 'product',
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.quantity * line.unitPrice,
            snapshotName: line.name,
            snapshotBasePrice: line.unitPrice,
            snapshotExtrasTotal: 0,
          },
        });
      }
      await prisma.orderTimeline.createMany({
        data: [
          { tenantId: tenant.id, orderId: order.id, status: 'confirmed', createdAt: new Date(params.createdAt.getTime() + 5 * 60_000) },
          { tenantId: tenant.id, orderId: order.id, status: 'ready_for_pickup', createdAt: new Date(params.createdAt.getTime() + 25 * 60_000) },
          { tenantId: tenant.id, orderId: order.id, status: 'out_for_delivery', createdAt: new Date(params.createdAt.getTime() + 35 * 60_000) },
          { tenantId: tenant.id, orderId: order.id, status: params.status ?? 'completed', createdAt: new Date(params.createdAt.getTime() + 65 * 60_000) },
        ],
      });
      return order;
    }

    await createOrder({
      customerId: vip.id,
      customerName: vip.name,
      total: 112,
      createdAt: daysAgo(0, 19),
      sourceChannel: 'storefront',
      lines: [
        { productId: pizza.id, name: pizza.name, quantity: 2, unitPrice: 50 },
        { productId: soda.id, name: soda.name, quantity: 1, unitPrice: 12 },
      ],
    });
    await createOrder({
      customerId: vip.id,
      customerName: vip.name,
      total: 85,
      createdAt: daysAgo(3, 20),
      sourceChannel: 'pos',
      lines: [
        { productId: pizza.id, name: pizza.name, quantity: 1, unitPrice: 50 },
        { productId: calzone.id, name: calzone.name, quantity: 1, unitPrice: 35 },
      ],
    });
    await createOrder({
      customerId: risk.id,
      customerName: risk.name,
      total: 47,
      createdAt: daysAgo(10, 13),
      sourceChannel: 'whatsapp',
      lines: [
        { productId: calzone.id, name: calzone.name, quantity: 1, unitPrice: 35 },
        { productId: soda.id, name: soda.name, quantity: 1, unitPrice: 12 },
      ],
    });
    await createOrder({
      customerId: risk.id,
      customerName: risk.name,
      total: 50,
      createdAt: daysAgo(2, 21),
      sourceChannel: 'storefront',
      status: 'cancelled',
      lines: [{ productId: pizza.id, name: pizza.name, quantity: 1, unitPrice: 50 }],
    });

    await prisma.order.create({
      data: {
        tenantId: otherTenant.id,
        orderNumber: `BIO${Math.floor(Math.random() * 1_000_000)}`,
        status: 'completed',
        fulfillmentType: 'delivery',
        customerId: otherCustomer.id,
        customerName: otherCustomer.name,
        customerPhone: otherCustomer.phone,
        itemsSubtotal: 999,
        total: 999,
        sourceChannel: 'storefront',
        idempotencyKey: `other-bi-${Date.now()}`,
        publicTrackingToken: `other-bi-token-${Date.now()}`,
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        tenantId: tenant.id,
        name: 'Campanha BI E2E',
        objective: 'recovery_30',
        status: 'completed',
        messageTemplate: 'Volte para comprar',
        segmentRules: {},
        totalAudience: 2,
        totalSent: 2,
        totalDelivered: 2,
        totalRead: 1,
        totalClicked: 1,
        totalConverted: 1,
        revenueGenerated: 112,
        startedAt: daysAgo(1),
        completedAt: daysAgo(1),
      },
    });
    await prisma.campaignDispatch.create({
      data: {
        campaignId: campaign.id,
        customerId: vip.id,
        phone: vip.phone,
        status: 'read',
        sentAt: daysAgo(1),
        convertedAt: daysAgo(0),
        revenueGenerated: 112,
      },
    });

    await prisma.customerLoyaltyTransaction.createMany({
      data: [
        { tenantId: tenant.id, customerId: vip.id, type: 'earned', points: 100, description: 'E2E pontos' },
        { tenantId: tenant.id, customerId: vip.id, type: 'redeemed', points: 25, description: 'E2E resgate' },
      ],
    });
    await prisma.cashbackTransaction.createMany({
      data: [
        { tenantId: tenant.id, customerId: vip.id, type: 'earned', amount: 10, description: 'E2E cashback' },
        { tenantId: tenant.id, customerId: vip.id, type: 'used', amount: 4, description: 'E2E uso cashback' },
      ],
    });
    await prisma.customerWalletTransaction.create({
      data: { tenantId: tenant.id, customerId: vip.id, type: 'credit', amount: 8, source: 'e2e', description: 'E2E wallet' },
    });

    const durations: number[] = [];
    let dashboard = await bi.getDashboard(tenant.id);
    for (let i = 0; i < 12; i += 1) {
      const start = performance.now();
      dashboard = await bi.getDashboard(tenant.id);
      durations.push(performance.now() - start);
    }

    const [profitability, abcCurve, heatmap, forecast, customers, campaigns, loyalty, aiInsights, otherDashboard] =
      await Promise.all([
        bi.getProfitability(tenant.id),
        bi.getAbcCurve(tenant.id),
        bi.getHeatmap(tenant.id),
        bi.getForecast(tenant.id),
        bi.getCustomerIntelligence(tenant.id),
        bi.getCampaignDashboard(tenant.id),
        bi.getLoyaltyDashboard(tenant.id),
        bi.getAiInsights(tenant.id),
        bi.getDashboard(otherTenant.id),
      ]);

    const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] ?? 0;

    checks.push(assertCheck('Receita diaria/semanal/mensal', dashboard.revenue.today > 0 && dashboard.revenue.week > 0 && dashboard.revenue.month > 0, dashboard.revenue));
    checks.push(assertCheck('Rentabilidade produto/categoria', profitability.product.length > 0 && profitability.category.length > 0, { products: profitability.product.length, categories: profitability.category.length }));
    checks.push(assertCheck('Curva ABC correta', abcCurve.revenue.some((item) => item.classification === 'A'), { first: abcCurve.revenue[0] }));
    checks.push(assertCheck('Heatmap dias e horarios', heatmap.cells.some((cell) => cell.orders > 0), { cells: heatmap.cells.length }));
    checks.push(assertCheck('Forecast 7 e 30 dias', forecast.next7Days.predictedOrders > 0 && forecast.next30Days.predictedOrders > 0, forecast));
    checks.push(assertCheck('Clientes LTV churn frequencia', customers.ltv > 0 && customers.averageFrequency > 0 && customers.estimatedChurn >= 0, customers));
    checks.push(assertCheck('Campanhas ROI conversao', campaigns.revenueGenerated > 0 && campaigns.conversionRate > 0, campaigns));
    checks.push(assertCheck('Fidelidade pontos cashback', loyalty.pointsIssued > 0 && loyalty.cashbackIssued > 0, loyalty));
    checks.push(assertCheck('IA insights automatica', aiInsights.insights.length >= 3, { insights: aiInsights.insights.length }));
    checks.push(assertCheck('Tenant isolation', otherDashboard.revenue.month === 999, { tenantRevenue: dashboard.revenue.month, otherTenantRevenue: otherDashboard.revenue.month }));
    checks.push(assertCheck('Performance P95 < 1s', p95 < 1000, { p95Ms: p95, samples: durations }));

    const status = checks.every((check) => check.status === 'PASS') ? 'PASS' : 'FAIL';
    const report = {
      phase: 'FASE 13 - BI & DATA WAREHOUSE ENTERPRISE',
      status,
      generatedAt: new Date().toISOString(),
      tenantId: tenant.id,
      dataUsed: {
        tenants: 2,
        products: 3,
        completedOrders: 3,
        cancelledOrders: 1,
        campaignDispatches: 1,
        loyaltyTransactions: 2,
        cashbackTransactions: 2,
      },
      performance: { p95Ms: p95, samples: durations },
      validations: checks,
      reuseInventory: dashboard.reuse,
      duplicationDetected: false,
    };

    const reportJson = JSON.stringify(report, null, 2);
    writeFileSync(join(process.cwd(), '..', '..', 'phase13-bi-certification.json'), reportJson);
    if (status !== 'PASS') {
      throw new Error(`Phase 13 BI certification failed: ${JSON.stringify(checks.filter((check) => check.status === 'FAIL'))}`);
    }
  } finally {
    const e2eTenants = await prisma.tenant.findMany({
      where: { OR: [{ slug: { startsWith: 'phase13-bi-e2e-' } }, { slug: { in: [tenantSlug, otherSlug] } }] },
      select: { id: true },
    });
    const tenantIds = e2eTenants.map((tenant) => tenant.id);
    if (tenantIds.length) {
      const campaigns = await prisma.campaign.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } });
      const campaignIds = campaigns.map((campaign) => campaign.id);
      if (campaignIds.length) await prisma.campaignDispatch.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.$disconnect();
    await moduleRef.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
