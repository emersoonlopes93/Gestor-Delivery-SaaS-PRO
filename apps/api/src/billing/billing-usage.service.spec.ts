import { OrderStatus, Prisma } from '@prisma/client';
import { BillingUsageService } from './billing-usage.service';

describe('BillingUsageService ledger snapshots', () => {
  const defaultSettings = {
    countStorefrontOrders: true,
    countPosOrders: false,
    countWhatsappAiOrders: false,
    countManualOrders: false,
    countConfirmedOrders: false,
    countCompletedOrders: true,
    excludeCancelledOrders: true,
    discountReducesRevenue: true,
    includeDeliveryFeeByDefault: false,
    includeServiceFeeByDefault: false,
  };

  const makeService = (overrides?: {
    prisma?: Record<string, unknown>;
    ledgerPreview?: Record<string, unknown>;
  }) => {
    const prisma = {
      order: {
        aggregate: jest.fn(),
        count: jest.fn(),
      },
      billingUsageSnapshot: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      billingCycleRecord: {
        findUnique: jest.fn(),
      },
      billingPlan: {
        findUnique: jest.fn(),
      },
      billingRevenueTier: {
        findMany: jest.fn(),
      },
      ...(overrides?.prisma ?? {}),
    };
    const settings = {
      ensureDefaultSettings: jest.fn().mockResolvedValue(defaultSettings),
    };
    const rating = {
      selectRevenueTier: jest.fn(),
      calculateBaseAmountFromTier: jest.fn(),
    };
    const ledger = {
      getLedgerPreview: jest.fn().mockResolvedValue({
        eventsCount: 0,
        totalOrders: 0,
        totalRevenue: new Prisma.Decimal(0),
        totalAdjustments: new Prisma.Decimal(0),
        ruleVersionId: 'rule-1',
        checksum: 'checksum',
        ...(overrides?.ledgerPreview ?? {}),
      }),
    };

    return {
      prisma,
      settings,
      rating,
      ledger,
      service: new BillingUsageService(
        prisma as never,
        settings as never,
        rating as never,
        ledger as never,
      ),
    };
  };

  it('uses ledger as primary source when events exist', async () => {
    const { service, prisma } = makeService({
      ledgerPreview: {
        eventsCount: 2,
        totalOrders: 1,
        totalRevenue: new Prisma.Decimal(90),
        totalAdjustments: new Prisma.Decimal(-10),
        ruleVersionId: 'rule-1',
        checksum: 'abc123',
      },
    });

    const preview = await service.getBillableRevenuePreview({
      tenantId: 'tenant-1',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(preview).toEqual(expect.objectContaining({
      source: 'ledger',
      ordersCount: 1,
      billableAmount: new Prisma.Decimal(90),
      billingRuleVersionId: 'rule-1',
      totalAdjustments: new Prisma.Decimal(-10),
      checksum: 'abc123',
    }));
    expect(prisma.order.aggregate).not.toHaveBeenCalled();
  });

  it('falls back to orders only when ledger has no events', async () => {
    const { service, prisma } = makeService();
    prisma.order.aggregate.mockResolvedValue({
      _count: { _all: 1 },
      _sum: {
        total: new Prisma.Decimal(120),
        itemsSubtotal: new Prisma.Decimal(100),
        discountTotal: new Prisma.Decimal(10),
        deliveryFee: new Prisma.Decimal(20),
        serviceFee: new Prisma.Decimal(0),
      },
    });
    prisma.order.count.mockResolvedValue(2);

    const preview = await service.getBillableRevenuePreview({
      tenantId: 'tenant-1',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(preview).toEqual(expect.objectContaining({
      source: 'orders_fallback',
      includedStatuses: [OrderStatus.completed],
      ordersCount: 1,
      excludedOrdersCount: 1,
      billableAmount: new Prisma.Decimal(90),
    }));
    expect(prisma.order.aggregate).toHaveBeenCalled();
  });

  it('does not recalculate an existing snapshot after the cycle is closed', async () => {
    const existing = { id: 'snapshot-1', billableAmount: new Prisma.Decimal(50) };
    const { service, prisma } = makeService({
      ledgerPreview: {
        eventsCount: 1,
        totalOrders: 1,
        totalRevenue: new Prisma.Decimal(100),
      },
    });
    prisma.billingUsageSnapshot.findFirst.mockResolvedValue(existing);
    prisma.billingCycleRecord.findUnique.mockResolvedValue({ status: 'closed' });

    const snapshot = await service.getOrCreateUsageSnapshot({
      tenantId: 'tenant-1',
      cycleId: 'cycle-1',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(snapshot).toBe(existing);
    expect(prisma.billingUsageSnapshot.update).not.toHaveBeenCalled();
  });
});
