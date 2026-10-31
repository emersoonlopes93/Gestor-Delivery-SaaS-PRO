import { Prisma } from '@prisma/client';
import { BillingCycleService } from './billing-cycle.service';

describe('BillingCycleService', () => {
  it('returns the concurrent winner when the database unique key rejects a duplicate cycle', async () => {
    const concurrentCycle = { id: 'cycle-winner' };
    const prisma = {
      tenantBillingSubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
      },
      billingCycleRecord: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(concurrentCycle),
        create: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
          'duplicate cycle',
          { code: 'P2002', clientVersion: 'test' },
        )),
      },
    };
    const service = new BillingCycleService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.getOrCreateCycleForPeriod({
      tenantId: 'tenant-1',
      subscriptionId: 'subscription-1',
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: new Date('2026-11-01T00:00:00.000Z'),
    });

    expect(result).toEqual(concurrentCycle);
    expect(prisma.billingCycleRecord.create).toHaveBeenCalledTimes(1);
    expect(prisma.billingCycleRecord.findFirst).toHaveBeenCalledTimes(2);
  });
});
