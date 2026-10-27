import { InvoiceStatus, Prisma } from '@prisma/client';
import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  it('includes addon items in draft preview', async () => {
    const prisma = {};
    const rating = {
      selectRevenueTier: jest.fn().mockResolvedValue({ id: 'tier-1', label: 'Ate R$ 1.500' }),
    };
    const addons = {
      buildAddonInvoiceItems: jest.fn().mockResolvedValue([
        {
          type: 'addon:ai_agent',
          description: 'Add-on Agente IA',
          quantity: 1,
          unitAmount: new Prisma.Decimal(70),
          totalAmount: new Prisma.Decimal(70),
          metadata: { addonKey: 'ai_agent' },
        },
      ]),
    };

    const service = new InvoiceService(prisma as never, rating as never, addons as never);
    const items = await service.buildDraftInvoiceItemsPreview({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-01T00:00:00.000Z'),
      measuredRevenue: new Prisma.Decimal(2200),
      billableRevenue: new Prisma.Decimal(2200),
      baseAmount: new Prisma.Decimal(100),
      selectedTier: { id: 'tier-1', label: 'Ate R$ 1.500' } as never,
    });

    expect(items).toHaveLength(2);
    expect(items[1]).toEqual(expect.objectContaining({
      type: 'addon:ai_agent',
      totalAmount: new Prisma.Decimal(70),
    }));
  });

  it('does not recalculate a non-draft invoice during an idempotent cycle retry', async () => {
    const existingInvoice = { id: 'invoice-1', status: InvoiceStatus.open };
    const prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(existingInvoice) },
    };
    const service = new InvoiceService(prisma as never, {} as never, {} as never);

    const result = await service.getOrCreateDraftInvoiceForCycle({
      tenantId: 'tenant-1',
      subscriptionId: 'subscription-1',
      cycleId: 'cycle-1',
      planId: 'plan-1',
    });

    expect(result).toEqual(existingInvoice);
    expect(prisma.invoice.findFirst).toHaveBeenCalledTimes(1);
  });
});
