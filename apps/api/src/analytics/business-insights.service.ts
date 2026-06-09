import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class BusinessInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateInsights(tenantId: string) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const previousWeekStart = new Date(now);
    previousWeekStart.setDate(now.getDate() - 14);
    const monthStart = new Date(now);
    monthStart.setDate(now.getDate() - 30);

    const [topProduct, currentWeek, previousWeek, inactiveCustomers, pairings] = await Promise.all([
      this.getTopProduct(tenantId, weekStart, now),
      this.getTicketStats(tenantId, weekStart, now),
      this.getTicketStats(tenantId, previousWeekStart, weekStart),
      this.prisma.customer.count({ where: { tenantId, lastOrderDate: { lt: monthStart } } }),
      this.getTopPairing(tenantId, monthStart, now),
    ]);

    const insights: Array<{ type: string; severity: 'info' | 'success' | 'warning'; message: string; value?: number }> = [];

    if (topProduct) {
      insights.push({
        type: 'top_product',
        severity: 'success',
        message: `Seu produto mais vendido esta semana foi ${topProduct.name}.`,
        value: topProduct.quantity,
      });
    }

    if (pairings) {
      insights.push({
        type: 'product_pairing',
        severity: 'info',
        message: `Clientes que compram ${pairings.a} tambem compram ${pairings.b}.`,
        value: pairings.count,
      });
    }

    if (previousWeek.averageTicket > 0) {
      const change = ((currentWeek.averageTicket - previousWeek.averageTicket) / previousWeek.averageTicket) * 100;
      insights.push({
        type: 'average_ticket_change',
        severity: change >= 0 ? 'success' : 'warning',
        message: `Seu ticket medio ${change >= 0 ? 'aumentou' : 'caiu'} ${Math.abs(change).toFixed(0)}%.`,
        value: change,
      });
    }

    if (inactiveCustomers > 0) {
      insights.push({
        type: 'inactive_customers',
        severity: 'warning',
        message: `Voce tem ${inactiveCustomers} clientes sem comprar nos ultimos 30 dias.`,
        value: inactiveCustomers,
      });
    }

    return { generatedAt: now, insights };
  }

  async getRetentionDashboard(tenantId: string) {
    const [orders, campaigns, cashbackEarned, loyaltyEarned, customers] = await Promise.all([
      this.prisma.order.findMany({
        where: { tenantId, status: 'completed' },
        select: { total: true, customerId: true, couponId: true, cashbackUsed: true, createdAt: true },
      }),
      this.prisma.campaign.findMany({
        where: { tenantId },
        select: { totalConverted: true, revenueGenerated: true },
      }),
      this.prisma.cashbackTransaction.aggregate({
        where: { tenantId, type: 'earned' },
        _sum: { amount: true },
      }),
      this.prisma.customerLoyaltyTransaction.aggregate({
        where: { tenantId, type: 'earned' },
        _sum: { points: true },
      }),
      this.prisma.customer.findMany({
        where: { tenantId },
        select: { id: true, totalOrders: true, totalSpent: true, lastOrderDate: true },
      }),
    ]);

    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total), 0);
    const loyaltyCustomerIds = new Set(
      await this.prisma.customerLoyaltyTransaction
        .findMany({ where: { tenantId }, select: { customerId: true }, distinct: ['customerId'] })
        .then((rows) => rows.map((row) => row.customerId)),
    );
    const revenueByLoyalty = orders
      .filter((order) => order.customerId && loyaltyCustomerIds.has(order.customerId))
      .reduce((sum, order) => sum + Number(order.total), 0);
    const revenueByCashback = orders
      .filter((order) => Number(order.cashbackUsed ?? 0) > 0)
      .reduce((sum, order) => sum + Number(order.total), 0);
    const revenueByCampaign = campaigns.reduce((sum, campaign) => sum + Number(campaign.revenueGenerated), 0);
    const repeatCustomers = customers.filter((customer) => customer.totalOrders >= 2).length;

    return {
      revenueByLoyalty,
      revenueByCashback,
      revenueByCampaign,
      cashbackGenerated: Number(cashbackEarned._sum.amount ?? 0),
      loyaltyPointsGenerated: Number(loyaltyEarned._sum.points ?? 0),
      retentionRate: customers.length ? repeatCustomers / customers.length : 0,
      ltv: customers.length ? totalRevenue / customers.length : 0,
      averageFrequency: customers.length ? orders.length / customers.length : 0,
      reorderRate: orders.length ? orders.filter((order) => order.customerId).length / orders.length : 0,
    };
  }

  private async getTopProduct(tenantId: string, start: Date, end: Date) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId, status: 'completed', createdAt: { gte: start, lte: end } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length === 0) return null;

    const items = await this.prisma.orderItem.groupBy({
      by: ['productId', 'snapshotName'],
      where: {
        tenantId,
        orderId: { in: orderIds },
        productId: { not: null },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 1,
    });
    const item = items[0];
    if (!item) return null;
    return { productId: item.productId, name: item.snapshotName || 'Produto', quantity: Number(item._sum.quantity ?? 0) };
  }

  private async getTicketStats(tenantId: string, start: Date, end: Date) {
    const stats = await this.prisma.order.aggregate({
      where: { tenantId, status: 'completed', createdAt: { gte: start, lte: end } },
      _avg: { total: true },
      _count: { _all: true },
    });
    return { averageTicket: Number(stats._avg.total ?? 0), orders: stats._count._all };
  }

  private async getTopPairing(tenantId: string, start: Date, end: Date) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId, status: 'completed', createdAt: { gte: start, lte: end } },
      include: { items: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });

    const pairCounts = new Map<string, { a: string; b: string; count: number }>();
    for (const order of orders) {
      const names = Array.from(new Set(order.items.map((item) => item.snapshotName).filter(Boolean))).sort();
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          const key = `${names[i]}::${names[j]}`;
          const current = pairCounts.get(key) ?? { a: names[i], b: names[j], count: 0 };
          current.count += 1;
          pairCounts.set(key, current);
        }
      }
    }

    return Array.from(pairCounts.values()).sort((a, b) => b.count - a.count)[0] ?? null;
  }
}
