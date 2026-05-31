import { Injectable } from '@nestjs/common';
import { Prisma, BillingRevenueTier } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class BillingRatingService {
  constructor(private readonly prisma: PrismaService) {}

  async selectRevenueTier(
    planId: string,
    billableRevenue: Prisma.Decimal | number | string,
  ): Promise<BillingRevenueTier | null> {
    const revenue = new Prisma.Decimal(billableRevenue);
    const tiers = await this.prisma.billingRevenueTier.findMany({
      where: { planId },
      orderBy: [{ sortOrder: 'asc' }],
    });

    for (const tier of tiers) {
      const min = new Prisma.Decimal(tier.minRevenue);
      const max = tier.maxRevenue ? new Prisma.Decimal(tier.maxRevenue) : null;

      const meetsMin = revenue.gte(min);
      const meetsMax = max ? revenue.lte(max) : true;

      if (meetsMin && meetsMax) {
        return tier;
      }
    }

    return tiers.length ? tiers[tiers.length - 1] : null;
  }

  async calculateBaseAmountFromTier(
    planId: string,
    billableRevenue: Prisma.Decimal | number | string,
  ): Promise<Prisma.Decimal> {
    const tier = await this.selectRevenueTier(planId, billableRevenue);
    return tier?.price ?? new Prisma.Decimal(0);
  }
}
