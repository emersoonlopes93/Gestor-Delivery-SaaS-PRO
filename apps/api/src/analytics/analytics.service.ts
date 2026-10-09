import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '@prisma/client';
import { OrderStatus as PrismaOrderStatus, StockMovementType } from '@prisma/client';
import { 
  OperationalMetricsDTO, 
  CommercialMetricsDTO, 
  CostMarginMetricsDTO, 
  MetricFilterDTO,
  OrderStatus,
  FulfillmentType,
} from '@gestor/types';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildDateRange(filter: MetricFilterDTO): Prisma.DateTimeFilter {
    return {
      gte: new Date(filter.startDate),
      lte: new Date(filter.endDate),
    };
  }

  private toNumber(value: unknown): number {
    return Number(value || 0);
  }

  private async buildOrderItemCostCache(
    items: Array<{
      productId: string | null;
    }>,
  ): Promise<{
    productUnitCost: Map<string, number>;
  }> {
    const productIds = Array.from(
      new Set(items.map((item) => item.productId).filter((id): id is string => typeof id === 'string')),
    );

    const productRecipes = productIds.length
        ? await this.prisma.tenantClient.productRecipeIngredient.findMany({
            where: { productId: { in: productIds } },
            include: { ingredient: true },
          })
        : [];

    const productsDirectCost = productIds.length
      ? await this.prisma.tenantClient.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, costPrice: true },
        })
      : [];

    const productUnitCost = new Map<string, number>();
    
    // Start with direct cost if available
    for (const p of productsDirectCost) {
      if (p.costPrice) {
        productUnitCost.set(p.id, this.toNumber(p.costPrice));
      }
    }

    // Add/Override with recipe cost if recipe exists
    const recipeCosts = new Map<string, number>();
    for (const recipe of productRecipes) {
      const current = recipeCosts.get(recipe.productId) ?? 0;
      recipeCosts.set(
        recipe.productId,
        current + this.toNumber(recipe.quantity) * this.toNumber(recipe.ingredient.currentCost),
      );
    }

    for (const [pid, cost] of recipeCosts.entries()) {
      productUnitCost.set(pid, cost);
    }

    return { productUnitCost };
  }

  private estimateOrderItemCost(
    item: {
      productId: string | null;
      quantity: unknown;
    },
    cache: {
      productUnitCost: Map<string, number>;
    },
  ): number {
    const unitCost = item.productId ? cache.productUnitCost.get(item.productId) ?? 0 : 0;
    return unitCost * this.toNumber(item.quantity);
  }

  private toStringKey(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : 'unknown';
  }

  async getOperationalMetrics(tenantId: string, filter: MetricFilterDTO): Promise<OperationalMetricsDTO> {
    const { startDate, endDate, channel } = filter;

    const orders = await this.prisma.tenantClient.order.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        ...(channel ? { sourceChannel: channel } : {}),
      },
      include: { timeline: true },
    });

    const metrics: OperationalMetricsDTO = {
      totalOrders: orders.length,
      ordersByStatus: this.countByField(orders, 'status') as Record<OrderStatus, number>,
      ordersByChannel: this.countByField(orders, 'sourceChannel'),
      ordersByFulfillment: this.countByField(orders, 'fulfillmentType') as Record<FulfillmentType, number>,
      averagePreparationTimeMinutes: this.calculateAverageTime(orders, 'confirmed', 'ready_for_pickup'),
      averageDeliveryTimeMinutes: this.calculateAverageTime(orders, 'out_for_delivery', 'completed'),
      cancellationRate: this.calculateCancellationRate(orders),
      peakHours: this.calculatePeakHours(orders),
    };

    return metrics;
  }

  async getCommercialMetrics(tenantId: string, filter: MetricFilterDTO): Promise<CommercialMetricsDTO> {
    const { startDate, endDate, channel } = filter;

    const where: Prisma.OrderWhereInput = {
      tenantId,
      status: PrismaOrderStatus.completed,
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
      ...(channel ? { sourceChannel: channel } : {}),
    };

    type CommercialOrder = Prisma.OrderGetPayload<{ include: { items: true; coupon: true } }>;

    const orders = await this.prisma.tenantClient.order.findMany({
      where,
      include: { items: true, coupon: true },
    });

    const totalRevenue = (orders as CommercialOrder[]).reduce((acc, order) => acc + Number(order.total), 0);
    const totalOrders = orders.length;

    const metrics: CommercialMetricsDTO = {
      totalRevenue,
      totalOrders,
      averageTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      revenueByChannel: this.aggregateRevenueByField(orders, 'sourceChannel'),
      revenueByCategory: await this.getRevenueByCategory(tenantId, where),
      topProducts: await this.getTopProducts(tenantId, where),
      topCombos: await this.getTopCombos(tenantId, where),
      couponUsage: this.getCouponUsage(orders),
      cashbackStats: await this.getCashbackStats(tenantId, where),
    };

    return metrics;
  }

  async getCostMarginMetrics(tenantId: string, filter: MetricFilterDTO): Promise<CostMarginMetricsDTO> {
    const { startDate, endDate } = filter;

    // 1. Calculate Real CMV from Stock Movements (Theoretical Depletion)
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        type: StockMovementType.theoretical_depletion,
        order: { is: { status: { not: PrismaOrderStatus.cancelled } } },
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
    });

    const realCMV = movements.reduce((acc: number, m) => acc + (Number(m.quantity) * Number(m.unitCost || 0)), 0);

    // 2. Calculate Gross Revenue from Completed Orders
    const completedOrdersValue = await this.prisma.order.aggregate({
      where: {
        tenantId,
        status: 'completed',
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      _sum: { total: true }
    });

    const totalRevenue = Number(completedOrdersValue._sum.total || 0);
    const grossMargin = totalRevenue - realCMV;

    return {
      estimatedCMV: realCMV,
      estimatedGrossMargin: grossMargin,
      grossMarginPercentage: totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0,
      productPerformance: await this.getProductPerformance(tenantId, filter),
      categoryPerformance: await this.getCategoryPerformance(tenantId, filter),
      channelPerformance: await this.getChannelPerformance(tenantId, filter),
    };
  }

  private async getProductPerformance(tenantId: string, filter: MetricFilterDTO) {
    const createdAt = this.buildDateRange(filter);
    
    const validOrders = await this.prisma.tenantClient.order.findMany({
      where: { tenantId, status: 'completed', createdAt },
      select: { id: true },
    });
    const orderIds = validOrders.map(o => o.id);

    // Get top 10 products by quantity sold
    const topItems = await this.prisma.tenantClient.orderItem.groupBy({
      by: ['productId', 'snapshotName'],
      where: {
        tenantId,
        lineType: 'product',
        orderId: { in: orderIds.length > 0 ? orderIds : ['__empty__'] },
      },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    const productIds = Array.from(
      new Set(topItems.map((item) => item.productId).filter((id): id is string => typeof id === 'string')),
    );
    const recipes = productIds.length
      ? await this.prisma.tenantClient.productRecipeIngredient.findMany({
          where: { productId: { in: productIds } },
          include: { ingredient: true },
        })
      : [];

    const productsDirectCost = productIds.length
      ? await this.prisma.tenantClient.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, costPrice: true },
        })
      : [];

    const productUnitCost = new Map<string, number>();

    // Direct cost
    for (const p of productsDirectCost) {
      if (p.costPrice) {
        productUnitCost.set(p.id, this.toNumber(p.costPrice));
      }
    }

    // Recipe cost (override)
    const recipeCosts = new Map<string, number>();
    for (const recipe of recipes) {
      const current = recipeCosts.get(recipe.productId) ?? 0;
      recipeCosts.set(
        recipe.productId,
        current + this.toNumber(recipe.quantity) * this.toNumber(recipe.ingredient.currentCost),
      );
    }

    for (const [pid, cost] of recipeCosts.entries()) {
      productUnitCost.set(pid, cost);
    }

    const performance = topItems.map((item) => {
      const revenue = this.toNumber(item._sum.lineTotal);
      const quantity = this.toNumber(item._sum.quantity);
      const totalCost = item.productId ? (productUnitCost.get(item.productId) ?? 0) * quantity : 0;
      const margin = revenue - totalCost;

      return {
        id: item.productId || 'unknown',
        name: item.snapshotName || 'Produto',
        estimatedCost: totalCost,
        revenue,
        grossMargin: margin,
        marginPercentage: revenue > 0 ? (margin / revenue) * 100 : 0,
      };
    });

    return performance;
  }

  private async getCategoryPerformance(tenantId: string, filter: MetricFilterDTO) {
    const createdAt = this.buildDateRange(filter);
    
    const items = await this.prisma.tenantClient.orderItem.findMany({
      where: {
        tenantId,
        order: {
          status: 'completed',
          createdAt,
        },
      },
      include: {
        product: { include: { category: true } },
      }
    });

    const cache = await this.buildOrderItemCostCache(
      items.map((item) => ({
        productId: item.productId,
      })),
    );

    const categoryStats: Record<string, { revenue: number, cost: number }> = {};

    for (const item of items) {
      const categoryName = item.product?.category?.name || 'Sem Categoria';
      if (!categoryStats[categoryName]) categoryStats[categoryName] = { revenue: 0, cost: 0 };
      
      const revenue = this.toNumber(item.lineTotal);
      const cost = this.estimateOrderItemCost(
        {
          productId: item.productId,
          quantity: item.quantity,
        },
        cache,
      );
      
      categoryStats[categoryName].revenue += revenue;
      categoryStats[categoryName].cost += cost;
    }

    return Object.entries(categoryStats).map(([name, stats]) => {
      const margin = stats.revenue - stats.cost;
      return {
        name,
        revenue: stats.revenue,
        cost: stats.cost,
        grossMargin: margin,
        marginPercentage: stats.revenue > 0 ? (margin / stats.revenue) * 100 : 0
      };
    });
  }

  private async getChannelPerformance(tenantId: string, filter: MetricFilterDTO) {
    const createdAt = this.buildDateRange(filter);
    
    const orders = await this.prisma.tenantClient.order.findMany({
      where: {
        tenantId,
        status: 'completed',
        createdAt,
      },
      include: { items: true }
    });

    const allItems = orders.flatMap((order) => order.items);
    const cache = await this.buildOrderItemCostCache(
      allItems.map((item) => ({
        productId: item.productId,
      })),
    );

    const channelStats: Record<string, { revenue: number, cost: number }> = {};

    for (const order of orders) {
      const channel = order.sourceChannel || 'Balcão';
      if (!channelStats[channel]) channelStats[channel] = { revenue: 0, cost: 0 };
      
      channelStats[channel].revenue += this.toNumber(order.total);
      
      for (const item of order.items) {
        channelStats[channel].cost += this.estimateOrderItemCost(
          {
            productId: item.productId,
            quantity: item.quantity,
          },
          cache,
        );
      }
    }

    return Object.entries(channelStats).map(([name, stats]) => {
      const margin = stats.revenue - stats.cost;
      return {
        name,
        revenue: stats.revenue,
        cost: stats.cost,
        grossMargin: margin,
        marginPercentage: stats.revenue > 0 ? (margin / stats.revenue) * 100 : 0
      };
    });
  }

  async getFinancialMetrics(tenantId: string, filter: MetricFilterDTO) {
    const { startDate, endDate } = filter;

    const transactions = await this.prisma.financialTransaction.findMany({
      where: {
        tenantId,
        paymentDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        status: 'paid',
      }
    });

    const income = transactions
      .filter((t) => t.type === 'income')
      .reduce((acc: number, t) => acc + Number(t.amount), 0);
    
    const expenses = transactions
      .filter((t) => t.type === 'expense')
      .reduce((acc: number, t) => acc + Number(t.amount), 0);

    const accounts = await this.prisma.financialAccount.aggregate({
      where: { tenantId, active: true },
      _sum: { balance: true }
    });

    return {
      totalIncome: income,
      totalExpenses: expenses,
      cashBalance: Number(accounts._sum.balance || 0),
      netCashFlow: income - expenses,
    };
  }

  // Helper Methods

  private countByField<T extends Record<string, unknown>, K extends keyof T>(
    items: T[],
    field: K,
  ): Record<string, number> {
    return items.reduce((acc: Record<string, number>, item) => {
      const key = this.toStringKey(item[field]);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  private aggregateRevenueByField<T extends Record<string, unknown>, K extends keyof T>(
    orders: Array<T & { total: unknown }>,
    field: K,
  ): Record<string, number> {
    return orders.reduce((acc: Record<string, number>, order) => {
      const key = this.toStringKey(order[field]);
      acc[key] = (acc[key] || 0) + Number(order.total);
      return acc;
    }, {});
  }

  private calculateAverageTime(
    orders: Array<{ timeline: Array<{ status: unknown; createdAt: Date }> }>,
    startStatus: string,
    endStatus: string,
  ): number {
    let totalMinutes = 0;
    let count = 0;

    for (const order of orders) {
      const start = order.timeline.find((t) => String(t.status) === startStatus);
      const end = order.timeline.find((t) => String(t.status) === endStatus);

      if (start && end) {
        const diff = new Date(end.createdAt).getTime() - new Date(start.createdAt).getTime();
        totalMinutes += diff / (1000 * 60);
        count++;
      }
    }

    return count > 0 ? totalMinutes / count : 0;
  }

  private calculateCancellationRate(orders: Array<{ status: unknown }>): number {
    if (orders.length === 0) return 0;
    const cancelled = orders.filter((o) => String(o.status) === 'cancelled').length;
    return (cancelled / orders.length) * 100;
  }

  private calculatePeakHours(orders: Array<{ createdAt: Date }>): Array<{ hour: number; count: number }> {
    const hours: Record<number, number> = {};
    orders.forEach((o) => {
      const hour = new Date(o.createdAt).getHours();
      hours[hour] = (hours[hour] || 0) + 1;
    });

    return Object.entries(hours)
      .map(([hour, count]: [string, number]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => a.hour - b.hour);
  }

  private getCouponUsage(
    orders: Array<{ coupon: { id: string; code: string } | null; discountTotal: unknown }>,
  ) {
    const usage: Record<string, { id: string; code: string; count: number; discount: number }> = {};
    orders.forEach((o) => {
      if (o.coupon) {
        if (!usage[o.coupon.id]) {
          usage[o.coupon.id] = { id: o.coupon.id, code: o.coupon.code, count: 0, discount: 0 };
        }
        usage[o.coupon.id].count++;
        usage[o.coupon.id].discount += Number(o.discountTotal);
      }
    });

    return Object.values(usage).map((u) => ({
      id: u.id,
      code: u.code,
      usageCount: u.count,
      discountTotal: u.discount,
    }));
  }

  private async getCashbackStats(tenantId: string, where: Prisma.OrderWhereInput) {
    const createdAt = where.createdAt as Prisma.DateTimeFilter | undefined;
    if (!createdAt) {
      return { earnedTotal: 0, redeemedTotal: 0 };
    }

    const earned = await this.prisma.tenantClient.cashbackTransaction.aggregate({
      where: { tenantId, type: 'earned', createdAt },
      _sum: { amount: true },
    });
    const redeemed = await this.prisma.tenantClient.cashbackTransaction.aggregate({
      where: { tenantId, type: 'used', createdAt },
      _sum: { amount: true },
    });

    return {
      earnedTotal: Number(earned._sum.amount || 0),
      redeemedTotal: Number(redeemed._sum.amount || 0),
    };
  }

  private async getRevenueByCategory(tenantId: string, orderWhere: Prisma.OrderWhereInput): Promise<Record<string, number>> {
    const items = await this.prisma.tenantClient.orderItem.findMany({
      where: {
        tenantId,
        order: {
          status: orderWhere.status,
          createdAt: orderWhere.createdAt,
          sourceChannel: orderWhere.sourceChannel,
        },
      },
      include: {
        product: {
          include: { category: true },
        },
      },
    });

    const revenue: Record<string, number> = {};

    items.forEach((item) => {
      const categoryName = item.product?.category?.name || 'Sem Categoria';
      revenue[categoryName] = (revenue[categoryName] || 0) + Number(item.lineTotal);
    });

    return revenue;
  }

  private async getTopProducts(tenantId: string, where: Prisma.OrderWhereInput) {
    const validOrders = await this.prisma.tenantClient.order.findMany({
      where,
      select: { id: true },
    });
    const orderIds = validOrders.map(o => o.id);

    const items = await this.prisma.tenantClient.orderItem.groupBy({
      by: ['productId', 'snapshotName'],
      where: { orderId: { in: orderIds.length > 0 ? orderIds : ['__empty__'] }, lineType: 'product' },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    const hasProductId = (
      i: (typeof items)[number],
    ): i is (typeof items)[number] & { productId: string } => typeof i.productId === 'string';

    return items
      .filter(hasProductId)
      .map((i) => ({
        id: i.productId,
        name: i.snapshotName,
        quantity: i._sum.quantity ?? 0,
        revenue: Number(i._sum.lineTotal || 0),
      }));
  }

  private async getTopCombos(tenantId: string, where: Prisma.OrderWhereInput) {
    const validOrders = await this.prisma.tenantClient.order.findMany({
      where,
      select: { id: true },
    });
    const orderIds = validOrders.map(o => o.id);

    const items = await this.prisma.tenantClient.orderItem.groupBy({
      by: ['comboId', 'snapshotName'],
      where: { orderId: { in: orderIds.length > 0 ? orderIds : ['__empty__'] }, lineType: 'combo' },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    const hasComboId = (
      i: (typeof items)[number],
    ): i is (typeof items)[number] & { comboId: string } => typeof i.comboId === 'string';

    return items
      .filter(hasComboId)
      .map((i) => ({
        id: i.comboId,
        name: i.snapshotName,
        quantity: i._sum.quantity ?? 0,
        revenue: Number(i._sum.lineTotal || 0),
      }));
  }

}
