import { Prisma } from '@prisma/client';
import { BillingRatingService } from './billing-rating.service';

describe('BillingRatingService', () => {
  const tiers = [
    {
      id: 'tier-free',
      planId: 'plan-1',
      minRevenue: new Prisma.Decimal(0),
      maxRevenue: new Prisma.Decimal(1500),
      price: new Prisma.Decimal(0),
      label: 'Ate R$ 1.500',
      sortOrder: 0,
    },
    {
      id: 'tier-growth',
      planId: 'plan-1',
      minRevenue: new Prisma.Decimal(1500.01),
      maxRevenue: new Prisma.Decimal(4000),
      price: new Prisma.Decimal(100),
      label: 'Ate R$ 4.000',
      sortOrder: 1,
    },
    {
      id: 'tier-cap',
      planId: 'plan-1',
      minRevenue: new Prisma.Decimal(6000.01),
      maxRevenue: null,
      price: new Prisma.Decimal(300),
      label: 'Acima de R$ 6.000',
      sortOrder: 2,
    },
  ];

  it('returns zero up to the free tier limit', async () => {
    const prisma = {
      billingRevenueTier: {
        findMany: jest.fn().mockResolvedValue(tiers),
      },
    };

    const service = new BillingRatingService(prisma as never);
    const amount = await service.calculateBaseAmountFromTier('plan-1', 1500);

    expect(amount).toEqual(new Prisma.Decimal(0));
  });

  it('respects the top tier price cap for high revenue', async () => {
    const prisma = {
      billingRevenueTier: {
        findMany: jest.fn().mockResolvedValue(tiers),
      },
    };

    const service = new BillingRatingService(prisma as never);
    const selectedTier = await service.selectRevenueTier('plan-1', 12000);
    const amount = await service.calculateBaseAmountFromTier('plan-1', 12000);

    expect(selectedTier?.id).toBe('tier-cap');
    expect(amount).toEqual(new Prisma.Decimal(300));
  });
});
