import { PrismaClient } from '@prisma/client';
import { loadApiEnvFiles } from '../src/config/env-paths';

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
}

async function main() {
  loadApiEnvFiles();
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    const [
      suspiciousProducts,
      suspiciousOptionItems,
      suspiciousCoverage,
      suspiciousRules,
      suspiciousOrders,
    ] = await Promise.all([
      prisma.product.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          basePrice: { gt: 0, lt: 1 },
        },
        select: {
          id: true,
          name: true,
          basePrice: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.optionItem.findMany({
        where: {
          isActive: true,
          priceImpactType: { not: 'none' },
          priceImpactValue: { gt: 0, lt: 0.5 },
        },
        select: {
          id: true,
          name: true,
          priceImpactType: true,
          priceImpactValue: true,
          tenant: { select: { id: true, name: true, slug: true } },
          optionGroup: { select: { id: true, name: true } },
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.deliveryCoverageConfig.findMany({
        where: {
          OR: [
            { maximumFee: { lt: 0.2 } },
            { defaultPricePerKm: { gt: 0, lt: 0.2 } },
            {
              AND: [
                { minimumFee: { not: null } },
                { maximumFee: { not: null } },
              ],
            },
          ],
        },
        select: {
          tenant: { select: { id: true, name: true, slug: true } },
          minimumFee: true,
          maximumFee: true,
          defaultPricePerKm: true,
        },
        take: 50,
      }),
      prisma.deliveryRateRule.findMany({
        where: {
          isActive: true,
          OR: [
            { fixedFee: { gt: 0, lt: 0.2 } },
            { pricePerKm: { gt: 0, lt: 0.2 } },
            { fixedRate: { gt: 0, lt: 0.2 } },
            { ratePerKm: { gt: 0, lt: 0.2 } },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          pricingMode: true,
          fixedFee: true,
          pricePerKm: true,
          fixedRate: true,
          ratePerKm: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.order.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) },
          fulfillmentType: 'delivery',
          deliveryFee: { gt: 0, lt: 0.2 },
        },
        select: {
          id: true,
          orderNumber: true,
          deliveryFee: true,
          total: true,
          createdAt: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const coverageWithMinGreaterThanMax = suspiciousCoverage.filter((item) => {
      if (item.minimumFee == null || item.maximumFee == null) return false;
      return Number(item.maximumFee) < Number(item.minimumFee);
    });

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        suspiciousProducts: suspiciousProducts.length,
        suspiciousOptionItems: suspiciousOptionItems.length,
        suspiciousCoverageConfigs: suspiciousCoverage.length,
        suspiciousCoverageMinGreaterThanMax: coverageWithMinGreaterThanMax.length,
        suspiciousDeliveryRules: suspiciousRules.length,
        suspiciousRecentOrders: suspiciousOrders.length,
      },
      suspiciousProducts: suspiciousProducts.map((item) => ({
        tenant: `${item.tenant.name} (${item.tenant.slug})`,
        productId: item.id,
        name: item.name,
        basePrice: Number(item.basePrice),
        basePriceFormatted: money(Number(item.basePrice)),
      })),
      suspiciousOptionItems: suspiciousOptionItems.map((item) => ({
        tenant: `${item.tenant.name} (${item.tenant.slug})`,
        optionGroup: item.optionGroup.name,
        itemId: item.id,
        name: item.name,
        priceImpactType: item.priceImpactType,
        priceImpactValue: Number(item.priceImpactValue),
        priceImpactValueFormatted: money(Number(item.priceImpactValue)),
      })),
      suspiciousCoverageConfigs: suspiciousCoverage.map((item) => ({
        tenant: `${item.tenant.name} (${item.tenant.slug})`,
        minimumFee: item.minimumFee == null ? null : Number(item.minimumFee),
        minimumFeeFormatted: item.minimumFee == null ? null : money(Number(item.minimumFee)),
        maximumFee: item.maximumFee == null ? null : Number(item.maximumFee),
        maximumFeeFormatted: item.maximumFee == null ? null : money(Number(item.maximumFee)),
        defaultPricePerKm: Number(item.defaultPricePerKm),
        defaultPricePerKmFormatted: money(Number(item.defaultPricePerKm)),
        minGreaterThanMax:
          item.minimumFee != null && item.maximumFee != null
            ? Number(item.maximumFee) < Number(item.minimumFee)
            : false,
      })),
      suspiciousDeliveryRules: suspiciousRules.map((item) => ({
        tenant: `${item.tenant.name} (${item.tenant.slug})`,
        ruleId: item.id,
        name: item.name,
        type: item.type,
        pricingMode: item.pricingMode,
        fixedFee: item.fixedFee == null ? null : Number(item.fixedFee),
        pricePerKm: item.pricePerKm == null ? null : Number(item.pricePerKm),
        fixedRate: item.fixedRate == null ? null : Number(item.fixedRate),
        ratePerKm: item.ratePerKm == null ? null : Number(item.ratePerKm),
      })),
      suspiciousRecentOrders: suspiciousOrders.map((item) => ({
        tenant: `${item.tenant.name} (${item.tenant.slug})`,
        orderId: item.id,
        orderNumber: item.orderNumber,
        deliveryFee: Number(item.deliveryFee),
        deliveryFeeFormatted: money(Number(item.deliveryFee)),
        total: Number(item.total),
        totalFormatted: money(Number(item.total)),
        createdAt: item.createdAt.toISOString(),
      })),
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('diagnose-monetary-values failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
