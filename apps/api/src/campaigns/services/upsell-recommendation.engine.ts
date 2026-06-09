import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface UpsellRecommendationInput {
  items: Array<{ productId?: string | null; comboId?: string | null; quantity?: number }>;
  customerId?: string | null;
  limit?: number;
}

@Injectable()
export class UpsellRecommendationEngine {
  constructor(private readonly prisma: PrismaService) {}

  async recommend(tenantId: string, input: UpsellRecommendationInput) {
    const limit = Math.min(Math.max(input.limit ?? 3, 1), 6);
    const baseIds = new Set(input.items.map((item) => item.productId ?? item.comboId).filter(Boolean) as string[]);
    if (baseIds.size === 0) return { recommendations: [], reason: 'empty_cart' };

    const matchingItems = await this.prisma.orderItem.findMany({
      where: {
        tenantId,
        OR: [{ productId: { in: Array.from(baseIds) } }, { comboId: { in: Array.from(baseIds) } }],
      },
      select: { orderId: true },
      distinct: ['orderId'],
      take: 500,
    });

    const completedOrders = await this.prisma.order.findMany({
      where: {
        tenantId,
        status: 'completed',
        id: { in: matchingItems.map((item) => item.orderId) },
      },
      include: { items: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });

    const scores = new Map<string, { id: string; name: string; score: number; quantity: number }>();
    for (const order of completedOrders) {
      const orderHasBase = order.items.some((item) => baseIds.has(item.productId ?? item.comboId ?? ''));
      if (!orderHasBase) continue;

      for (const item of order.items) {
        const id = item.productId ?? item.comboId;
        if (!id || baseIds.has(id)) continue;
        const current = scores.get(id) ?? { id, name: item.snapshotName, score: 0, quantity: 0 };
        current.score += 1;
        current.quantity += item.quantity;
        scores.set(id, current);
      }
    }

    if (input.customerId) {
      const customerOrders = await this.prisma.order.findMany({
        where: { tenantId, customerId: input.customerId, status: 'completed' },
        include: { items: true },
        take: 50,
        orderBy: { createdAt: 'desc' },
      });

      for (const order of customerOrders) {
        for (const item of order.items) {
          const id = item.productId ?? item.comboId;
          if (!id || baseIds.has(id)) continue;
          const current = scores.get(id) ?? { id, name: item.snapshotName, score: 0, quantity: 0 };
          current.score += 0.5;
          current.quantity += item.quantity;
          scores.set(id, current);
        }
      }
    }

    const candidateIds = Array.from(scores.keys());
    const sellableProducts = candidateIds.length
      ? await this.prisma.product.findMany({
          where: {
            tenantId,
            id: { in: candidateIds },
            isActive: true,
            isAvailable: true,
            sellableOnline: true,
            deletedAt: null,
          },
          select: { id: true, name: true, basePrice: true, image: true, type: true },
        })
      : [];

    const productById = new Map(sellableProducts.map((product) => [product.id, product]));

    return {
      recommendations: Array.from(scores.values())
        .filter((score) => productById.has(score.id))
        .sort((a, b) => b.score - a.score || b.quantity - a.quantity)
        .slice(0, limit)
        .map((score) => {
          const product = productById.get(score.id)!;
          return {
            productId: product.id,
            name: product.name || score.name,
            price: Number(product.basePrice),
            image: product.image,
            type: product.type,
            score: score.score,
            reason: 'Frequentemente comprado junto',
          };
        }),
      reason: 'tenant_cooccurrence_and_customer_history',
    };
  }
}
