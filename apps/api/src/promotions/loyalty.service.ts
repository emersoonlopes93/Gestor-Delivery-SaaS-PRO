import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LoyaltyTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class LoyaltyService {
  constructor(private readonly db: PrismaService) {}

  async getSummary(tenantId: string, customerId: string) {
    const customer = await this.db.customer.findUnique({
      where: { id: customerId, tenantId },
      select: { id: true, name: true, loyaltyPoints: true, totalOrders: true, totalSpent: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const history = await this.listTransactions(tenantId, customerId);
    return {
      customerId: customer.id,
      name: customer.name,
      balance: customer.loyaltyPoints,
      totalOrders: customer.totalOrders,
      totalSpent: Number(customer.totalSpent),
      badges: this.getBadges(customer.totalOrders, Number(customer.totalSpent)),
      history,
    };
  }

  async listTransactions(tenantId: string, customerId: string) {
    const rows = await this.db.customerLoyaltyTransaction.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows;
  }

  async createTransaction(params: {
    tenantId: string;
    customerId: string;
    type: LoyaltyTransactionType;
    points: number;
    orderId?: string;
    description?: string;
  }) {
    if (!Number.isInteger(params.points) || params.points <= 0) {
      throw new BadRequestException('Points must be a positive integer');
    }

    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const customer = await tx.customer.findUnique({ where: { id: params.customerId } });
      if (!customer || customer.tenantId !== params.tenantId) throw new NotFoundException('Customer not found');

      const debit = params.type === 'redeemed' || params.type === 'expired';
      if (debit && customer.loyaltyPoints < params.points) {
        throw new BadRequestException('Insufficient loyalty points');
      }

      await tx.customer.update({
        where: { id: params.customerId },
        data: { loyaltyPoints: debit ? { decrement: params.points } : { increment: params.points } },
      });

      return tx.customerLoyaltyTransaction.create({
        data: {
          tenantId: params.tenantId,
          customerId: params.customerId,
          type: params.type,
          points: params.points,
          orderId: params.orderId ?? null,
          description: params.description ?? null,
        },
      });
    });
  }

  async awardForOrder(tenantId: string, orderId: string) {
    const order = await this.db.order.findFirst({
      where: { id: orderId, tenantId, customerId: { not: null } },
      select: { id: true, orderNumber: true, customerId: true, total: true },
    });
    if (!order?.customerId) return null;

    const existing = await this.db.customerLoyaltyTransaction.findFirst({
      where: { tenantId, orderId, type: 'earned' },
      select: { id: true },
    });
    if (existing) return null;

    const settings = await this.db.tenantSettings.findUnique({
      where: { tenantId },
      select: { loyaltyEnabled: true, loyaltyPointsPerReal: true },
    });
    if (settings && !settings.loyaltyEnabled) return null;

    const multiplier = settings?.loyaltyPointsPerReal ?? 1;
    const points = Math.floor(Number(order.total) * multiplier);
    if (points <= 0) return null;

    return this.createTransaction({
      tenantId,
      customerId: order.customerId,
      type: 'earned',
      points,
      orderId: order.id,
      description: `Pontos do pedido ${order.orderNumber}`,
    });
  }

  async redeem(tenantId: string, customerId: string, points: number, description?: string) {
    return this.createTransaction({
      tenantId,
      customerId,
      type: 'redeemed',
      points,
      description: description ?? 'Resgate de pontos',
    });
  }

  async add(tenantId: string, customerId: string, points: number, description?: string) {
    return this.createTransaction({
      tenantId,
      customerId,
      type: 'earned',
      points,
      description: description ?? 'Bônus manual de pontos',
    });
  }

  getBadges(totalOrders: number, totalSpent: number) {
    const badges: string[] = [];
    if (totalOrders >= 1) badges.push('Primeira Compra');
    if (totalOrders >= 5) badges.push('5 Pedidos');
    if (totalOrders >= 10) badges.push('10 Pedidos');
    if (totalOrders >= 5 && totalSpent >= 500) badges.push('Cliente VIP');
    if (totalOrders >= 3) badges.push('Cliente Frequente');
    return badges;
  }
}
