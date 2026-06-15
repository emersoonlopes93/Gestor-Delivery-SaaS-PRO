import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CampaignsService } from '../campaigns/services/campaigns.service';
import { CustomerIntelligenceService } from '../crm/customer-intelligence.service';
import { PrismaService } from '../database/prisma.service';
import { AnalyticsService } from './analytics.service';
import { BusinessInsightsService } from './business-insights.service';

type DateRange = { startDate: string; endDate: string };

type ProductProfitability = {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  estimatedCost: number;
  grossProfit: number;
  marginPercentage: number;
};

@Injectable()
export class BusinessIntelligenceService {
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly ttlMs = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly businessInsightsService: BusinessInsightsService,
    @Inject(forwardRef(() => CustomerIntelligenceService))
    private readonly customerIntelligenceService: CustomerIntelligenceService,
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaignsService: CampaignsService,
  ) {}

  async getDashboard(tenantId: string) {
    return this.cached(`bi:dashboard:${tenantId}`, async () => {
      const now = new Date();
      const ranges = {
        today: this.dayRange(now),
        yesterday: this.dayRange(this.addDays(now, -1)),
        week: this.rangeFromDays(now, 6),
        month: this.monthRange(now),
        year: this.yearRange(now),
        previousWeek: this.rangeBetween(this.addDays(now, -13), this.addDays(now, -7)),
      };

      const [today, yesterday, week, month, year, previousWeek, operation, clients, campaigns, loyalty] =
        await Promise.all([
          this.analyticsService.getCommercialMetrics(tenantId, ranges.today),
          this.analyticsService.getCommercialMetrics(tenantId, ranges.yesterday),
          this.analyticsService.getCommercialMetrics(tenantId, ranges.week),
          this.analyticsService.getCommercialMetrics(tenantId, ranges.month),
          this.analyticsService.getCommercialMetrics(tenantId, ranges.year),
          this.analyticsService.getCommercialMetrics(tenantId, ranges.previousWeek),
          this.analyticsService.getOperationalMetrics(tenantId, ranges.month),
          this.getCustomerIntelligence(tenantId),
          this.getCampaignDashboard(tenantId),
          this.getLoyaltyDashboard(tenantId),
        ]);

      const orderGrowth = this.growthPercentage(week.totalOrders, previousWeek.totalOrders);
      const conversionRate = campaigns.sent ? campaigns.converted / campaigns.sent : 0;

      return {
        generatedAt: new Date(),
        reuse: this.getReuseInventory(),
        revenue: {
          today: today.totalRevenue,
          yesterday: yesterday.totalRevenue,
          week: week.totalRevenue,
          month: month.totalRevenue,
          year: year.totalRevenue,
        },
        orders: {
          quantity: month.totalOrders,
          averageTicket: month.averageTicket,
          growthPercentage: orderGrowth,
        },
        customers: clients.summary,
        operation: {
          averagePreparationTimeMinutes: operation.averagePreparationTimeMinutes,
          averageDeliveryTimeMinutes: operation.averageDeliveryTimeMinutes,
          cancelledOrders: operation.ordersByStatus.cancelled ?? 0,
          conversionRate,
        },
        campaigns,
        loyalty,
      };
    });
  }

  async getProfitability(tenantId: string, range = this.defaultRange()) {
    return this.cached(`bi:profitability:${tenantId}:${range.startDate}:${range.endDate}`, async () => {
      const [costs, products] = await Promise.all([
        this.analyticsService.getCostMarginMetrics(tenantId, range),
        this.getProductProfitability(tenantId, range),
      ]);

      return {
        generatedAt: new Date(),
        source: 'AnalyticsService+RecipesService+Inventory ingredient costs',
        product: products,
        category: (costs.categoryPerformance ?? []).map((item) => ({
          name: item.name,
          revenue: item.revenue,
          profit: item.grossMargin,
          marginPercentage: item.marginPercentage,
        })),
        channel: (costs.channelPerformance ?? []).map((item) => ({
          name: this.normalizeChannel(item.name),
          revenue: item.revenue,
          profit: item.grossMargin,
          marginPercentage: item.marginPercentage,
        })),
      };
    });
  }

  async getAbcCurve(tenantId: string, range = this.defaultRange()) {
    const profitability = await this.getProfitability(tenantId, range);
    return {
      generatedAt: new Date(),
      revenue: this.classifyAbc(profitability.product, 'revenue'),
      quantity: this.classifyAbc(profitability.product, 'quantity'),
      profit: this.classifyAbc(profitability.product, 'grossProfit'),
    };
  }

  async getCustomerIntelligence(tenantId: string) {
    return this.cached(`bi:customers:${tenantId}`, async () => {
      const [kpis, segments] = await Promise.all([
        this.customerIntelligenceService.getRevenueKpis(tenantId),
        this.customerIntelligenceService.getSegments(tenantId),
      ]);
      const riskIds = new Set([
        ...segments.bySegment.at_risk.map((item) => item.customerId),
        ...segments.bySegment.inactive_60.map((item) => item.customerId),
        ...segments.bySegment.inactive_90.map((item) => item.customerId),
      ]);
      const total = segments.profiles.length;

      return {
        source: 'CustomerIntelligenceService',
        ltv: kpis.ltv,
        averageFrequency: kpis.purchaseFrequency,
        averageTicket: kpis.averageTicket,
        atRiskCustomers: riskIds.size,
        estimatedChurn: total ? riskIds.size / total : 0,
        summary: {
          newCustomers: segments.bySegment.new.length,
          recurringCustomers: segments.profiles.filter((profile) => profile.totalOrders >= 2).length,
          vipCustomers: segments.bySegment.vip.length,
          atRiskCustomers: riskIds.size,
        },
      };
    });
  }

  async getHeatmap(tenantId: string, range = this.defaultRange()) {
    return this.cached(`bi:heatmap:${tenantId}:${range.startDate}:${range.endDate}`, async () => {
      const orders = await this.prisma.order.findMany({
        where: { tenantId, status: 'completed', createdAt: this.toDateFilter(range) },
        select: { createdAt: true, total: true },
        take: 10_000,
      });

      const matrix = Array.from({ length: 7 }, (_, day) =>
        Array.from({ length: 24 }, (_, hour) => ({ dayOfWeek: day, hour, orders: 0, revenue: 0 })),
      );

      for (const order of orders) {
        const day = order.createdAt.getDay();
        const hour = order.createdAt.getHours();
        matrix[day][hour].orders += 1;
        matrix[day][hour].revenue += Number(order.total);
      }

      return {
        generatedAt: new Date(),
        days: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'],
        hours: Array.from({ length: 16 }, (_, index) => index + 8),
        cells: matrix.flat().filter((cell) => cell.hour >= 8 && cell.hour <= 23),
      };
    });
  }

  async getForecast(tenantId: string) {
    return this.cached(`bi:forecast:${tenantId}`, async () => {
      const end = new Date();
      const start = this.addDays(end, -59);
      const orders = await this.prisma.order.findMany({
        where: { tenantId, status: 'completed', createdAt: { gte: this.startOfDay(start), lte: this.endOfDay(end) } },
        select: { createdAt: true, total: true },
        take: 20_000,
      });

      const daily = new Map<string, { orders: number; revenue: number }>();
      for (let i = 59; i >= 0; i -= 1) {
        daily.set(this.dateKey(this.addDays(end, -i)), { orders: 0, revenue: 0 });
      }
      for (const order of orders) {
        const key = this.dateKey(order.createdAt);
        const current = daily.get(key) ?? { orders: 0, revenue: 0 };
        current.orders += 1;
        current.revenue += Number(order.total);
        daily.set(key, current);
      }

      const values = Array.from(daily.values());
      const last7 = values.slice(-7);
      const last30 = values.slice(-30);
      const average7 = this.averageDaily(last7);
      const average30 = this.averageDaily(last30);

      return {
        generatedAt: new Date(),
        method: 'moving_average_internal_history',
        next7Days: {
          predictedOrders: Math.round(average7.orders * 7),
          predictedRevenue: Number((average7.revenue * 7).toFixed(2)),
        },
        next30Days: {
          predictedOrders: Math.round(average30.orders * 30),
          predictedRevenue: Number((average30.revenue * 30).toFixed(2)),
        },
      };
    });
  }

  async getProductDashboard(tenantId: string, range = this.defaultRange()) {
    const profitability = await this.getProfitability(tenantId, range);
    const products = profitability.product;
    const previous = await this.getProductProfitability(tenantId, this.previousRange(range));
    const previousById = new Map(previous.map((item) => [item.id, item]));

    const withGrowth = products.map((item) => {
      const past = previousById.get(item.id);
      return { ...item, growthPercentage: this.growthPercentage(item.revenue, past?.revenue ?? 0) };
    });

    return {
      generatedAt: new Date(),
      bestSellers: [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
      mostProfitable: [...products].sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 10),
      leastSold: [...products].sort((a, b) => a.quantity - b.quantity).slice(0, 10),
      lowestMargin: [...products].sort((a, b) => a.marginPercentage - b.marginPercentage).slice(0, 10),
      growing: [...withGrowth].filter((item) => item.growthPercentage > 0).sort((a, b) => b.growthPercentage - a.growthPercentage).slice(0, 10),
      falling: [...withGrowth].filter((item) => item.growthPercentage < 0).sort((a, b) => a.growthPercentage - b.growthPercentage).slice(0, 10),
    };
  }

  async getCampaignDashboard(tenantId: string) {
    return this.cached(`bi:campaigns:${tenantId}`, async () => {
      const center = await this.campaignsService.getAutomationCenter(tenantId);
      const totals = center.totals;
      return {
        source: 'CampaignsService+CampaignAutomationService',
        sent: totals.sent,
        delivered: totals.delivered,
        read: totals.read,
        clicked: totals.clicked,
        converted: totals.converted,
        revenueGenerated: totals.revenueGenerated,
        roi: 0,
        conversionRate: totals.sent ? totals.converted / totals.sent : 0,
        active: center.active.length,
        paused: center.paused.length,
      };
    });
  }

  async getLoyaltyDashboard(tenantId: string) {
    return this.cached(`bi:loyalty:${tenantId}`, async () => {
      const [loyalty, cashback, walletCustomers] = await Promise.all([
        this.prisma.customerLoyaltyTransaction.groupBy({
          by: ['type'],
          where: { tenantId },
          _sum: { points: true },
          _count: { _all: true },
        }),
        this.prisma.cashbackTransaction.groupBy({
          by: ['type'],
          where: { tenantId },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.customerWalletTransaction.findMany({
          where: { tenantId },
          select: { customerId: true },
          distinct: ['customerId'],
        }),
      ]);

      const pointsIssued = Number(loyalty.find((item) => item.type === 'earned')?._sum.points ?? 0);
      const pointsRedeemed = Number(loyalty.find((item) => item.type === 'redeemed')?._sum.points ?? 0);
      const cashbackIssued = Number(cashback.find((item) => item.type === 'earned')?._sum.amount ?? 0);
      const cashbackUsed = Number(cashback.find((item) => item.type === 'used')?._sum.amount ?? 0);
      const loyaltyCustomers = await this.prisma.customerLoyaltyTransaction.findMany({
        where: { tenantId },
        select: { customerId: true },
        distinct: ['customerId'],
      });

      return {
        source: 'LoyaltyService+CashbackService+WalletService ledgers',
        loyalCustomers: new Set([...loyaltyCustomers.map((item) => item.customerId), ...walletCustomers.map((item) => item.customerId)]).size,
        pointsIssued,
        pointsRedeemed,
        cashbackIssued,
        cashbackUsed,
      };
    });
  }

  async getAiInsights(tenantId: string) {
    const [profitability, heatmap, customers, products, insights] = await Promise.all([
      this.getProfitability(tenantId),
      this.getHeatmap(tenantId),
      this.getCustomerIntelligence(tenantId),
      this.getProductDashboard(tenantId),
      this.businessInsightsService.generateInsights(tenantId),
    ]);

    const mostProfitableProduct = profitability.product[0] ?? null;
    const mostProfitableCategory = [...profitability.category].sort((a, b) => b.profit - a.profit)[0] ?? null;
    const sortedHeat = [...heatmap.cells].sort((a, b) => b.revenue - a.revenue);
    const strongest = sortedHeat[0] ?? null;
    const weakest = [...heatmap.cells].filter((cell) => cell.orders > 0).sort((a, b) => a.revenue - b.revenue)[0] ?? null;

    return {
      generatedAt: new Date(),
      source: 'internal_data_no_llm',
      insights: [
        mostProfitableProduct
          ? { type: 'most_profitable_product', severity: 'success', message: `Produto mais lucrativo: ${mostProfitableProduct.name}.`, value: mostProfitableProduct.grossProfit }
          : null,
        mostProfitableCategory
          ? { type: 'most_profitable_category', severity: 'success', message: `Categoria mais lucrativa: ${mostProfitableCategory.name}.`, value: mostProfitableCategory.profit }
          : null,
        strongest
          ? { type: 'strongest_hour', severity: 'info', message: `Horario mais forte: ${heatmap.days[strongest.dayOfWeek]} ${strongest.hour}h.`, value: strongest.revenue }
          : null,
        weakest
          ? { type: 'weakest_hour', severity: 'warning', message: `Horario mais fraco com vendas: ${heatmap.days[weakest.dayOfWeek]} ${weakest.hour}h.`, value: weakest.revenue }
          : null,
        { type: 'customers_at_risk', severity: customers.atRiskCustomers > 0 ? 'warning' : 'success', message: `${customers.atRiskCustomers} clientes em risco.`, value: customers.atRiskCustomers },
        { type: 'upsell_opportunities', severity: 'info', message: `${products.growing.length} produtos em crescimento podem alimentar upsell.`, value: products.growing.length },
        { type: 'reorder_opportunities', severity: 'info', message: `${customers.summary.recurringCustomers} clientes recorrentes para recompra.`, value: customers.summary.recurringCustomers },
        ...insights.insights.slice(0, 3),
      ].filter(Boolean),
    };
  }

  async getStorefrontBestSellers(tenantId: string, daysBack = 30, limit = 6): Promise<string[]> {
    const cacheKey = `bi:storefront:best-sellers:${tenantId}:${daysBack}d:${limit}`;
    const ttlMs = 15 * 60 * 1000; // 15 minutos para cache da vitrine
    return this.cached(
      cacheKey,
      async () => {
        const end = new Date();
        const start = this.addDays(end, -daysBack);
        const range = { startDate: this.startOfDay(start).toISOString(), endDate: this.endOfDay(end).toISOString() };

        const profitability = await this.getProductProfitability(tenantId, range);
        return profitability
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, limit)
          .map((item) => item.id);
      },
      ttlMs
    );
  }

  private async getProductProfitability(tenantId: string, range: DateRange): Promise<ProductProfitability[]> {
    const orders = await this.prisma.order.findMany({
      where: { tenantId, status: 'completed', createdAt: this.toDateFilter(range) },
      select: { id: true },
      take: 20_000,
    });
    const orderIds = orders.map((order) => order.id);
    if (!orderIds.length) return [];

    const items = await this.prisma.orderItem.groupBy({
      by: ['productId', 'snapshotName'],
      where: { tenantId, orderId: { in: orderIds }, productId: { not: null } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 200,
    });

    const productIds = items.map((item) => item.productId).filter((id): id is string => Boolean(id));
    const [recipes, products] = await Promise.all([
      this.prisma.productRecipeIngredient.findMany({
        where: { tenantId, productId: { in: productIds } },
        include: { ingredient: true },
      }),
      this.prisma.product.findMany({
        where: { tenantId, id: { in: productIds } },
        select: { id: true, costPrice: true },
      }),
    ]);

    const unitCost = new Map<string, number>();
    for (const product of products) {
      if (product.costPrice !== null) unitCost.set(product.id, Number(product.costPrice));
    }
    const recipeCosts = new Map<string, number>();
    for (const recipe of recipes) {
      recipeCosts.set(
        recipe.productId,
        (recipeCosts.get(recipe.productId) ?? 0) + Number(recipe.quantity) * Number(recipe.ingredient.currentCost),
      );
    }
    for (const [productId, cost] of recipeCosts) unitCost.set(productId, cost);

    return items.map((item) => {
      const id = item.productId ?? 'unknown';
      const quantity = Number(item._sum.quantity ?? 0);
      const revenue = Number(item._sum.lineTotal ?? 0);
      const estimatedCost = (unitCost.get(id) ?? 0) * quantity;
      const grossProfit = revenue - estimatedCost;
      return {
        id,
        name: item.snapshotName || 'Produto',
        quantity,
        revenue,
        estimatedCost,
        grossProfit,
        marginPercentage: revenue ? (grossProfit / revenue) * 100 : 0,
      };
    });
  }

  private classifyAbc<T extends ProductProfitability>(items: T[], key: 'revenue' | 'quantity' | 'grossProfit') {
    const sorted = [...items].sort((a, b) => b[key] - a[key]);
    const total = sorted.reduce((sum, item) => sum + Math.max(0, item[key]), 0);
    let cumulative = 0;
    return sorted.map((item) => {
      cumulative += Math.max(0, item[key]);
      const cumulativePercentage = total ? cumulative / total : 0;
      const classification = cumulativePercentage <= 0.8 ? 'A' : cumulativePercentage <= 0.95 ? 'B' : 'C';
      return { ...item, metric: key, cumulativePercentage, classification };
    });
  }

  private async cached<T>(key: string, factory: () => Promise<T>, ttlMs = this.ttlMs): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    const value = await factory();
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  private getReuseInventory() {
    return {
      finance: ['AnalyticsService', 'OrdersService data', 'CashbackService ledger', 'WalletService ledger'],
      crm: ['CustomerIntelligenceService', 'CRM Enterprise data model', 'LoyaltyService ledger', 'CampaignAutomationService'],
      inventory: ['RecipesService data', 'Stock movements', 'Ingredient costs'],
      commercial: ['BusinessInsightsService', 'Campaigns', 'Coupons', 'Cashback', 'Fidelidade'],
      ai: ['Agent Tools data', 'Customer Intelligence', 'Business Insights'],
    };
  }

  private normalizeChannel(channel: string) {
    const lower = channel.toLowerCase();
    if (lower.includes('pos')) return 'PDV';
    if (lower.includes('whatsapp')) return 'WhatsApp';
    if (lower.includes('ifood')) return 'Ifood';
    if (lower.includes('storefront')) return 'Loja propria';
    return channel || 'Loja propria';
  }

  private averageDaily(values: Array<{ orders: number; revenue: number }>) {
    if (!values.length) return { orders: 0, revenue: 0 };
    return {
      orders: values.reduce((sum, item) => sum + item.orders, 0) / values.length,
      revenue: values.reduce((sum, item) => sum + item.revenue, 0) / values.length,
    };
  }

  private growthPercentage(current: number, previous: number) {
    if (!previous) return current > 0 ? 1 : 0;
    return (current - previous) / previous;
  }

  private defaultRange(): DateRange {
    const end = new Date();
    const start = this.addDays(end, -29);
    return { startDate: this.startOfDay(start).toISOString(), endDate: this.endOfDay(end).toISOString() };
  }

  private previousRange(range: DateRange): DateRange {
    const start = new Date(range.startDate);
    const end = new Date(range.endDate);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    const previousEnd = this.addDays(start, -1);
    return {
      startDate: this.startOfDay(this.addDays(previousEnd, -days)).toISOString(),
      endDate: this.endOfDay(previousEnd).toISOString(),
    };
  }

  private rangeFromDays(end: Date, daysBack: number): DateRange {
    return { startDate: this.startOfDay(this.addDays(end, -daysBack)).toISOString(), endDate: this.endOfDay(end).toISOString() };
  }

  private rangeBetween(start: Date, end: Date): DateRange {
    return { startDate: this.startOfDay(start).toISOString(), endDate: this.endOfDay(end).toISOString() };
  }

  private dayRange(date: Date): DateRange {
    return { startDate: this.startOfDay(date).toISOString(), endDate: this.endOfDay(date).toISOString() };
  }

  private monthRange(date: Date): DateRange {
    return { startDate: new Date(date.getFullYear(), date.getMonth(), 1).toISOString(), endDate: this.endOfDay(date).toISOString() };
  }

  private yearRange(date: Date): DateRange {
    return { startDate: new Date(date.getFullYear(), 0, 1).toISOString(), endDate: this.endOfDay(date).toISOString() };
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
  }

  private dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private toDateFilter(range: DateRange): Prisma.DateTimeFilter {
    return { gte: new Date(range.startDate), lte: new Date(range.endDate) };
  }
}
