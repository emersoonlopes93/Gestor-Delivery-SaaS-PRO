import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type CommercialCustomerSegment =
  | 'vip'
  | 'frequent'
  | 'inactive_30'
  | 'inactive_60'
  | 'inactive_90'
  | 'new'
  | 'at_risk';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

export interface CustomerIntelligenceProfile {
  customerId: string;
  name: string;
  phone: string;
  email: string | null;
  totalOrders: number;
  totalSpent: number;
  averageTicket: number;
  tenantAverageTicket: number;
  daysSinceLastOrder: number | null;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  preferredChannel: string | null;
  favoriteProducts: Array<{ id: string; name: string; orders: number; quantity: number }>;
  purchaseHours: Array<{ hour: number; orders: number }>;
  segments: CommercialCustomerSegment[];
  optedOut: boolean;
}

export interface ReorderCandidate {
  customerId: string;
  name: string;
  phone: string;
  daysSinceLastOrder: number;
  averageIntervalDays: number;
  favoriteProduct: { id: string; name: string } | null;
}

@Injectable()
export class CustomerIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  async analyzeCustomer(tenantId: string, customerId: string): Promise<CustomerIntelligenceProfile | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      include: { optOuts: true },
    });

    if (!customer) return null;

    const [orders, tenantAverageTicket] = await Promise.all([
      this.getCompletedOrders(tenantId, customerId),
      this.getTenantAverageTicket(tenantId),
    ]);

    return this.buildProfile(customer, orders, tenantAverageTicket);
  }

  async getSegments(tenantId: string) {
    const [customers, tenantAverageTicket] = await Promise.all([
      this.prisma.customer.findMany({
        where: { tenantId },
        include: { optOuts: true },
        orderBy: { lastOrderDate: 'desc' },
      }),
      this.getTenantAverageTicket(tenantId),
    ]);

    const orderGroups = await this.prisma.order.findMany({
      where: { tenantId, status: 'completed', customerId: { not: null } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    const ordersByCustomer = new Map<string, OrderWithItems[]>();
    for (const order of orderGroups) {
      if (!order.customerId) continue;
      const group = ordersByCustomer.get(order.customerId) ?? [];
      group.push(order);
      ordersByCustomer.set(order.customerId, group);
    }

    const profiles = customers.map((customer) =>
      this.buildProfile(customer, ordersByCustomer.get(customer.id) ?? [], tenantAverageTicket),
    );

    const bySegment = profiles.reduce<Record<CommercialCustomerSegment, CustomerIntelligenceProfile[]>>(
      (acc, profile) => {
        for (const segment of profile.segments) acc[segment].push(profile);
        return acc;
      },
      {
        vip: [],
        frequent: [],
        inactive_30: [],
        inactive_60: [],
        inactive_90: [],
        new: [],
        at_risk: [],
      },
    );

    return { tenantAverageTicket, profiles, bySegment };
  }

  async getRevenueKpis(tenantId: string) {
    const now = new Date();
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);
    const previous30 = new Date(now);
    previous30.setDate(now.getDate() - 60);

    const [completedOrders, activeCustomers, previousActiveCustomers, campaigns] = await Promise.all([
      this.prisma.order.findMany({
        where: { tenantId, status: 'completed' },
        select: { total: true, customerId: true, createdAt: true, sourceChannel: true },
      }),
      this.prisma.customer.count({ where: { tenantId, lastOrderDate: { gte: last30 } } }),
      this.prisma.customer.count({ where: { tenantId, lastOrderDate: { gte: previous30, lt: last30 } } }),
      this.prisma.campaign.findMany({
        where: { tenantId },
        select: { objective: true, totalConverted: true, totalSent: true },
      }),
    ]);

    const totalRevenue = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const uniqueCustomers = new Set(completedOrders.map((order) => order.customerId).filter(Boolean));
    const last30Orders = completedOrders.filter((order) => order.createdAt >= last30);
    const customerOrders = new Map<string, number>();
    for (const order of completedOrders) {
      if (!order.customerId) continue;
      customerOrders.set(order.customerId, (customerOrders.get(order.customerId) ?? 0) + 1);
    }

    const sentCampaigns = campaigns.reduce((sum, campaign) => sum + campaign.totalSent, 0);
    const convertedCampaigns = campaigns.reduce((sum, campaign) => sum + campaign.totalConverted, 0);

    return {
      averageTicket: completedOrders.length ? totalRevenue / completedOrders.length : 0,
      ltv: uniqueCustomers.size ? totalRevenue / uniqueCustomers.size : 0,
      purchaseFrequency: uniqueCustomers.size ? completedOrders.length / uniqueCustomers.size : 0,
      retentionRate: previousActiveCustomers ? activeCustomers / previousActiveCustomers : activeCustomers > 0 ? 1 : 0,
      reactivationRate: sentCampaigns ? convertedCampaigns / sentCampaigns : 0,
      recoveredRevenue: 0,
      upsellConversionRate: 0,
      campaignConversionRate: sentCampaigns ? convertedCampaigns / sentCampaigns : 0,
      revenueLast30Days: last30Orders.reduce((sum, order) => sum + Number(order.total), 0),
    };
  }

  async getReorderCandidates(tenantId: string): Promise<ReorderCandidate[]> {
    const { profiles } = await this.getSegments(tenantId);
    const candidates: ReorderCandidate[] = [];

    for (const profile of profiles) {
      if (profile.optedOut || !profile.daysSinceLastOrder || profile.totalOrders < 2) continue;

      const orders = await this.getCompletedOrders(tenantId, profile.customerId);
      if (orders.length < 2) continue;

      const gaps = orders.slice(1).map((order, index) => this.daysBetween(orders[index].createdAt, order.createdAt));
      const averageIntervalDays = Math.max(1, Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length));

      if (profile.daysSinceLastOrder >= averageIntervalDays + 2) {
        const favoriteProduct = profile.favoriteProducts[0]
          ? { id: profile.favoriteProducts[0].id, name: profile.favoriteProducts[0].name }
          : null;
        candidates.push({
          customerId: profile.customerId,
          name: profile.name,
          phone: profile.phone,
          daysSinceLastOrder: profile.daysSinceLastOrder,
          averageIntervalDays,
          favoriteProduct,
        });
      }
    }

    return candidates.sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder).slice(0, 100);
  }

  private async getCompletedOrders(tenantId: string, customerId: string) {
    return this.prisma.order.findMany({
      where: { tenantId, customerId, status: 'completed' },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async getTenantAverageTicket(tenantId: string): Promise<number> {
    const aggregate = await this.prisma.order.aggregate({
      where: { tenantId, status: 'completed' },
      _avg: { total: true },
    });
    return Number(aggregate._avg.total ?? 0);
  }

  private buildProfile(
    customer: {
      id: string;
      name: string;
      phone: string;
      email: string | null;
      totalOrders: number;
      totalSpent: Prisma.Decimal;
      createdAt: Date;
      optOuts: unknown[];
    },
    orders: OrderWithItems[],
    tenantAverageTicket: number,
  ): CustomerIntelligenceProfile {
    const totalSpent = orders.length
      ? orders.reduce((sum, order) => sum + Number(order.total), 0)
      : Number(customer.totalSpent);
    const totalOrders = orders.length || customer.totalOrders;
    const averageTicket = totalOrders ? totalSpent / totalOrders : 0;
    const firstOrderAt = orders[0]?.createdAt ?? null;
    const lastOrderAt = orders[orders.length - 1]?.createdAt ?? null;
    const daysSinceLastOrder = lastOrderAt ? this.daysBetween(lastOrderAt, new Date()) : null;

    return {
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      totalOrders,
      totalSpent,
      averageTicket,
      tenantAverageTicket,
      daysSinceLastOrder,
      firstOrderAt,
      lastOrderAt,
      preferredChannel: this.getPreferredChannel(orders),
      favoriteProducts: this.getFavoriteProducts(orders),
      purchaseHours: this.getPurchaseHours(orders),
      segments: this.classifySegments({
        totalOrders,
        averageTicket,
        tenantAverageTicket,
        firstOrderAt,
        lastOrderAt,
        orders,
      }),
      optedOut: customer.optOuts.length > 0,
    };
  }

  private classifySegments(input: {
    totalOrders: number;
    averageTicket: number;
    tenantAverageTicket: number;
    firstOrderAt: Date | null;
    lastOrderAt: Date | null;
    orders: OrderWithItems[];
  }): CommercialCustomerSegment[] {
    const segments = new Set<CommercialCustomerSegment>();
    const daysSinceLastOrder = input.lastOrderAt ? this.daysBetween(input.lastOrderAt, new Date()) : null;
    const daysSinceFirstOrder = input.firstOrderAt ? this.daysBetween(input.firstOrderAt, new Date()) : null;

    if (input.totalOrders >= 5 && input.averageTicket > input.tenantAverageTicket) segments.add('vip');
    if (daysSinceLastOrder !== null && daysSinceLastOrder <= 30) segments.add('frequent');
    if (daysSinceLastOrder !== null && daysSinceLastOrder >= 30) segments.add('inactive_30');
    if (daysSinceLastOrder !== null && daysSinceLastOrder >= 60) segments.add('inactive_60');
    if (daysSinceLastOrder !== null && daysSinceLastOrder >= 90) segments.add('inactive_90');
    if (input.totalOrders === 1 && daysSinceFirstOrder !== null && daysSinceFirstOrder <= 30) segments.add('new');
    if (this.hasFrequencyDrop(input.orders)) segments.add('at_risk');
    if (segments.size === 0) segments.add('frequent');

    return Array.from(segments);
  }

  private hasFrequencyDrop(orders: OrderWithItems[]): boolean {
    if (orders.length < 3) return false;
    const gaps = orders.slice(1).map((order, index) => this.daysBetween(orders[index].createdAt, order.createdAt));
    const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const currentGap = this.daysBetween(orders[orders.length - 1].createdAt, new Date());
    return averageGap > 0 && currentGap > averageGap * 1.75 && currentGap >= 14;
  }

  private getPreferredChannel(orders: OrderWithItems[]): string | null {
    const counts = new Map<string, number>();
    for (const order of orders) counts.set(order.sourceChannel, (counts.get(order.sourceChannel) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  private getFavoriteProducts(orders: OrderWithItems[]) {
    const products = new Map<string, { id: string; name: string; orders: number; quantity: number }>();
    for (const order of orders) {
      const seenInOrder = new Set<string>();
      for (const item of order.items) {
        const id = item.productId ?? item.comboId;
        if (!id) continue;
        const current = products.get(id) ?? { id, name: item.snapshotName, orders: 0, quantity: 0 };
        current.quantity += item.quantity;
        if (!seenInOrder.has(id)) {
          current.orders += 1;
          seenInOrder.add(id);
        }
        products.set(id, current);
      }
    }
    return Array.from(products.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }

  private getPurchaseHours(orders: OrderWithItems[]) {
    const hours = new Map<number, number>();
    for (const order of orders) {
      const hour = order.createdAt.getHours();
      hours.set(hour, (hours.get(hour) ?? 0) + 1);
    }
    return Array.from(hours.entries())
      .map(([hour, orderCount]) => ({ hour, orders: orderCount }))
      .sort((a, b) => b.orders - a.orders);
  }

  private daysBetween(start: Date, end: Date): number {
    return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  }
}
