import { DeliveryLocationRetentionService } from './delivery-location-retention.service';

describe('DeliveryLocationRetentionService', () => {
  const prisma = {
    tenant: { findMany: jest.fn() },
    deliveryDriverLocation: { findMany: jest.fn(), deleteMany: jest.fn() },
  };
  const service = new DeliveryLocationRetentionService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('purges only tenant-scoped points older than 30 days in bounded batches', async () => {
    prisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-a' }]);
    prisma.deliveryDriverLocation.findMany
      .mockResolvedValueOnce([{ id: 'old-a' }, { id: 'old-b' }])
      .mockResolvedValueOnce([]);
    prisma.deliveryDriverLocation.deleteMany.mockResolvedValue({ count: 2 });
    const now = new Date('2026-08-12T12:00:00.000Z');

    await expect(service.purgeExpiredLocations(now, 2)).resolves.toBe(2);
    expect(prisma.deliveryDriverLocation.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', recordedAt: { lt: new Date('2026-07-13T12:00:00.000Z') } },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
      take: 2,
      select: { id: true },
    });
    expect(prisma.deliveryDriverLocation.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: { in: ['old-a', 'old-b'] } },
    });
  });

  it('is idempotent when no detailed history is expired', async () => {
    prisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-a' }]);
    prisma.deliveryDriverLocation.findMany.mockResolvedValue([]);
    await expect(service.purgeExpiredLocations()).resolves.toBe(0);
    expect(prisma.deliveryDriverLocation.deleteMany).not.toHaveBeenCalled();
  });
});
