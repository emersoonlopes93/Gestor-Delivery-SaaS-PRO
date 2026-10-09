import { Job } from 'bullmq';
import { DateTime } from 'luxon';
import { AnalyticsRollupProcessor } from './analytics-rollup.processor';
import {
  AnalyticsRollupQueueService,
  AnalyticsRollupSchedulerService,
  analyticsRollupJobId,
} from './analytics-rollup.queue.service';

const data = {
  tenantId: 'tenant-a',
  fromDate: '2026-07-27',
  toDate: '2026-07-29',
  timezone: 'America/Sao_Paulo',
  reason: 'late-event-recompute' as const,
  requestedAt: '2026-07-29T12:00:00.000Z',
};

describe('analytics rollup queue', () => {
  it('validates the payload and creates a deterministic job ID with queue defaults', async () => {
    const queue = { add: jest.fn().mockResolvedValue({ id: 'job-a' }) };
    const service = new AnalyticsRollupQueueService(queue as never);

    await expect(service.enqueue(data)).resolves.toEqual({
      jobId: 'analytics-rollup__tenant-a__2026-07-27__2026-07-29__late-event-recompute',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'analytics.daily-rollup',
      data,
      { jobId: analyticsRollupJobId(data) },
    );
    await service.enqueue(data, { schedulerSlot: 123 });
    await service.enqueue(data, { schedulerSlot: 123 });
    expect(queue.add).toHaveBeenNthCalledWith(
      3,
      'analytics.daily-rollup',
      data,
      {
        jobId: `${analyticsRollupJobId(data)}__slot-123`,
        removeOnComplete: { age: 86_400, count: 10_000 },
      },
    );
    await expect(service.enqueue({ ...data, tenantId: '' })).rejects.toThrow();
  });

  it('rejects missing tenant payloads before invoking the processor service', async () => {
    const rollup = { recomputeRange: jest.fn() };
    const processor = new AnalyticsRollupProcessor(rollup as never);
    await expect(processor.process({
      name: 'analytics.daily-rollup',
      data: { ...data, tenantId: undefined },
    } as Job)).rejects.toThrow();
    expect(rollup.recomputeRange).not.toHaveBeenCalled();
  });

  it('enqueues one tenant-scoped recent window and test mode never auto-schedules', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousScheduler = process.env.ANALYTICS_ROLLUP_SCHEDULER_ENABLED;
    const previousRollup = process.env.ANALYTICS_ROLLUP_ENABLED;
    const previousBullmq = process.env.BULLMQ_ENABLED;
    process.env.NODE_ENV = 'test';
    process.env.ANALYTICS_ROLLUP_SCHEDULER_ENABLED = 'true';
    process.env.ANALYTICS_ROLLUP_ENABLED = 'true';
    process.env.BULLMQ_ENABLED = 'true';
    const queue = { enqueue: jest.fn().mockResolvedValue({ jobId: 'job-a' }) };
    const prisma = {
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'tenant-a', settings: { timezone: 'America/Sao_Paulo' } },
        ]),
      },
    };
    const scheduler = new AnalyticsRollupSchedulerService(prisma as never, queue as never);
    try {
      scheduler.onModuleInit();
      expect(prisma.tenant.findMany).not.toHaveBeenCalled();
      await expect(scheduler.enqueueRecentWindows(
        DateTime.fromISO('2026-07-29T12:00:00.000Z'),
      )).resolves.toBe(1);
      expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: 'tenant-a',
        fromDate: '2026-07-27',
        toDate: '2026-07-29',
        reason: 'late-event-recompute',
      }), { schedulerSlot: expect.any(Number) });
    } finally {
      scheduler.onModuleDestroy();
      process.env.NODE_ENV = previousNodeEnv;
      process.env.ANALYTICS_ROLLUP_SCHEDULER_ENABLED = previousScheduler;
      process.env.ANALYTICS_ROLLUP_ENABLED = previousRollup;
      process.env.BULLMQ_ENABLED = previousBullmq;
    }
  });
});
