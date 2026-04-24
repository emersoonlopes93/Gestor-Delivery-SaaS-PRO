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
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
    });

    const realCMV = movements.reduce((acc: number, m: any) => acc + (Number(m.quantity) * Number(m.unitCost || 0)), 0);

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
    const { startDate, endDate } = filter;
    
    // Get top 10 products by quantity sold
    const topItems = await this.prisma.tenantClient.orderItem.groupBy({
      by: ['productId', 'snapshotName'],
      where: {
        tenantId,
        lineType: 'product',
        order: {
          status: 'completed',
          createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
        },
      },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    const performance = await Promise.all(
      topItems.map(async (item) => {
        const revenue = Number(item._sum.lineTotal || 0);
        const quantity = item._sum.quantity || 0;
        
        // Estimated cost based on recipe (Theoretical)
        let totalCost = 0;
        if (item.productId) {
          const recipe = await this.prisma.tenantClient.productRecipeIngredient.findMany({
            where: { productId: item.productId },
            include: { ingredient: true },
          });
          const unitCost = recipe.reduce(
            (acc, r) => acc + Number(r.quantity) * Number(r.ingredient.currentCost),
            0,
          );
          totalCost = unitCost * quantity;
        }

        const margin = revenue - totalCost;

        return {
          id: item.productId || 'unknown',
          name: item.snapshotName || 'Produto',
          estimatedCost: totalCost,
          revenue,
          grossMargin: margin,
          marginPercentage: revenue > 0 ? (margin / revenue) * 100 : 0,
        };
      }),
    );

    return performance;
  }

  private async getCategoryPerformance(tenantId: string, filter: MetricFilterDTO) {
    const { startDate, endDate } = filter;
    
    const items = await this.prisma.tenantClient.orderItem.findMany({
      where: {
        tenantId,
        order: {
          status: 'completed',
          createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
        },
      },
      include: {
        product: { include: { category: true } }
      }
    });

    const categoryStats: Record<string, { revenue: number, cost: number }> = {};

    for (const item of items) {
      const categoryName = item.product?.category?.name || 'Sem Categoria';
      if (!categoryStats[categoryName]) categoryStats[categoryName] = { revenue: 0, cost: 0 };
      
      const revenue = Number(item.lineTotal);
      const cost = await this.calculateItemEstimatedCost(tenantId, item as any);
      
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
    const { startDate, endDate } = filter;
    
    const orders = await this.prisma.tenantClient.order.findMany({
      where: {
        tenantId,
        status: 'completed',
        createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: { items: { include: { complements: true } } }
    });

    const channelStats: Record<string, { revenue: number, cost: number }> = {};

    for (const order of orders) {
      const channel = order.sourceChannel || 'Balcão';
      if (!channelStats[channel]) channelStats[channel] = { revenue: 0, cost: 0 };
      
      channelStats[channel].revenue += Number(order.total);
      
      for (const item of order.items) {
        channelStats[channel].cost += await this.calculateItemEstimatedCost(tenantId, item as any);
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
      .filter((t: any) => t.type === 'income')
      .reduce((acc: number, t: any) => acc + Number(t.amount), 0);
    
    const expenses = transactions
      .filter((t: any) => t.type === 'expense')
      .reduce((acc: number, t: any) => acc + Number(t.amount), 0);

    const accounts = await this.prisma.financialAccount.aggregate({
      where: { tenantId },
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

  private async getRevenueByCategory(tenantId: string, where: Prisma.OrderWhereInput): Promise<Record<string, number>> {
    const items = await this.prisma.tenantClient.orderItem.findMany({
      where: {
        tenantId,
        order: where,
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
    const items = await this.prisma.tenantClient.orderItem.groupBy({
      by: ['productId', 'snapshotName'],
      where: { order: where, lineType: 'product' },
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
    const items = await this.prisma.tenantClient.orderItem.groupBy({
      by: ['comboId', 'snapshotName'],
      where: { order: where, lineType: 'combo' },
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

  private async calculateItemEstimatedCost(
    tenantId: string,
    item: Prisma.OrderItemGetPayload<{ include: { complements: true } }>,
  ): Promise<number> {
    // Logic to calculate cost from recipe ingredients
    // This is an estimation based on current ingredient costs
    let unitCost = 0;
    
    if (item.productId) {
      const recipe = await this.prisma.tenantClient.productRecipeIngredient.findMany({
        where: { productId: item.productId },
        include: { ingredient: true },
      });
      unitCost += recipe.reduce(
        (acc, r) => acc + Number(r.quantity) * Number(r.ingredient.currentCost),
        0,
      );
    }

    // Add complements cost
    for (const comp of item.complements) {
      const compRecipe = await this.prisma.tenantClient.complementRecipeIngredient.findMany({
        where: { complementItemId: comp.complementItemId },
        include: { ingredient: true },
      });
      unitCost += compRecipe.reduce(
        (acc, r) => acc + Number(r.quantity) * Number(r.ingredient.currentCost),
        0,
      );
    }

    return unitCost * item.quantity;
  }
}
