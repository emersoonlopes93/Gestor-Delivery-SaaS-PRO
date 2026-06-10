import { Prisma } from '@prisma/client';
import { InvoiceService } from './invoice.service';

describe('InvoiceService snapshot linkage', () => {
  const makeService = () => {
    const prisma = {
      invoice: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      billingCycleRecord: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      billingUsageSnapshot: {
        findFirst: jest.fn(),
      },
      invoiceItem: {
        upsert: jest.fn(),
      },
    };
    const rating = {
      selectRevenueTier: jest.fn(),
    };

    return {
      prisma,
      rating,
      service: new InvoiceService(prisma as never, rating as never),
    };
  };

  it('creates a draft invoice linked to the usage snapshot and rule version', async () => {
    const { service, prisma, rating } = makeService();
    const cycle = {
      id: 'cycle-1',
      tenantId: 'tenant-1',
      subscriptionId: 'subscription-1',
      startedAt: new Date('2026-06-01T00:00:00.000Z'),
      endedAt: new Date('2026-07-01T00:00:00.000Z'),
      totalAmount: new Prisma.Decimal(99),
      measuredRevenue: new Prisma.Decimal(1000),
      billableRevenue: new Prisma.Decimal(900),
      baseAmount: new Prisma.Decimal(99),
      currency: 'BRL',
      selectedTier: null,
    };
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.billingCycleRecord.findFirst.mockResolvedValue(cycle);
    prisma.billingCycleRecord.findUnique.mockResolvedValue(cycle);
    prisma.billingUsageSnapshot.findFirst.mockResolvedValue({
      id: 'snapshot-1',
      billingRuleVersionId: 'rule-1',
    });
    prisma.invoice.create.mockImplementation(({ data }) => Promise.resolve({ id: 'invoice-1', ...data }));
    rating.selectRevenueTier.mockResolvedValue(null);

    const invoice = await service.getOrCreateDraftInvoiceForCycle({
      tenantId: 'tenant-1',
      subscriptionId: 'subscription-1',
      cycleId: 'cycle-1',
      planId: 'plan-1',
      usageSnapshotId: 'snapshot-1',
    });

    expect(invoice).toEqual(expect.objectContaining({
      usageSnapshotId: 'snapshot-1',
      billingRuleVersionId: 'rule-1',
      total: new Prisma.Decimal(99),
    }));
    expect(prisma.invoice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        usageSnapshotId: 'snapshot-1',
        billingRuleVersionId: 'rule-1',
      }),
    }));
  });

  it('does not mutate invoice totals when a draft already exists', async () => {
    const { service, prisma } = makeService();
    const existing = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      subscriptionId: 'subscription-1',
      cycleId: 'cycle-1',
      total: new Prisma.Decimal(50),
    };
    prisma.invoice.findFirst.mockResolvedValue(existing);
    prisma.billingCycleRecord.findUnique.mockResolvedValue({
      id: 'cycle-1',
      startedAt: new Date('2026-06-01T00:00:00.000Z'),
      endedAt: new Date('2026-07-01T00:00:00.000Z'),
      measuredRevenue: new Prisma.Decimal(1000),
      billableRevenue: new Prisma.Decimal(900),
      baseAmount: new Prisma.Decimal(99),
      selectedTier: null,
    });

    const invoice = await service.getOrCreateDraftInvoiceForCycle({
      tenantId: 'tenant-1',
      subscriptionId: 'subscription-1',
      cycleId: 'cycle-1',
      planId: 'plan-1',
      usageSnapshotId: 'snapshot-1',
    });

    expect(invoice).toBe(existing);
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });
});
