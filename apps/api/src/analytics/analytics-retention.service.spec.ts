import { AnalyticsRetentionService } from './analytics-retention.service';

describe('AnalyticsRetentionService', () => {
  const previous = process.env.ANALYTICS_RAW_RETENTION_ENABLED;

  afterEach(() => {
    process.env.ANALYTICS_RAW_RETENTION_ENABLED = previous;
  });

  it('is disabled by default and never touches raw events or aggregates', async () => {
    delete process.env.ANALYTICS_RAW_RETENTION_ENABLED;
    const prisma = {
      analyticsEvent: { findMany: jest.fn(), deleteMany: jest.fn() },
      analyticsDailyAggregate: { deleteMany: jest.fn() },
    };
    const service = new AnalyticsRetentionService(prisma as never);

    await expect(service.purgeTenantRawEvents({
      tenantId: 'tenant-a',
      olderThan: new Date('2026-01-01T00:00:00.000Z'),
    })).rejects.toThrow('analytics_retention_disabled');
    expect(prisma.analyticsEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.analyticsDailyAggregate.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes only tenant-scoped old raw events in bounded chunks', async () => {
    process.env.ANALYTICS_RAW_RETENTION_ENABLED = 'true';
    const prisma = {
      analyticsEvent: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'event-a' }, { id: 'event-b' }])
          .mockResolvedValueOnce([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const service = new AnalyticsRetentionService(prisma as never);
    const olderThan = new Date('2026-01-01T00:00:00.000Z');

    await expect(service.purgeTenantRawEvents({
      tenantId: 'tenant-a',
      olderThan,
      batchSize: 2,
    })).resolves.toEqual({ deleted: 2 });
    expect(prisma.analyticsEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', receivedAt: { lt: olderThan } },
      take: 2,
    }));
    expect(prisma.analyticsEvent.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: { in: ['event-a', 'event-b'] } },
    });
  });
});
