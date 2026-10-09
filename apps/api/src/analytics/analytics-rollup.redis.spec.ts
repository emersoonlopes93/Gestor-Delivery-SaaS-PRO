import 'reflect-metadata';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { ANALYTICS_DAILY_ROLLUP_JOB } from '@gestor/types';
import { analyticsRollupJobId } from './analytics-rollup.queue.service';

const redisUrl = process.env.ANALYTICS_ROLLUP_REDIS_TEST_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('analytics rollup ephemeral Redis proof', () => {
  jest.setTimeout(20_000);

  it('deduplicates concurrent job IDs and applies bounded retry/backoff', async () => {
    const url = new URL(redisUrl as string);
    const connection = { host: url.hostname, port: Number(url.port) };
    const queueName = `analytics-rollup-proof-${Date.now()}`;
    const queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 50 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
    const events = new QueueEvents(queueName, { connection });
    await events.waitUntilReady();
    let calls = 0;
    const worker = new Worker(queueName, async (job) => {
      calls += 1;
      expect(job.data.tenantId).toBe('tenant-proof');
      if (job.name === 'retry' && job.attemptsMade < 2) throw new Error('transient-proof');
      return { processedTenantId: job.data.tenantId };
    }, { connection, concurrency: 2 });

    try {
      const data = {
        tenantId: 'tenant-proof',
        fromDate: '2026-07-27',
        toDate: '2026-07-29',
        reason: 'late-event-recompute' as const,
      };
      const jobId = analyticsRollupJobId(data);
      const first = await queue.add(ANALYTICS_DAILY_ROLLUP_JOB, data, { jobId });
      const duplicate = await queue.add(ANALYTICS_DAILY_ROLLUP_JOB, data, { jobId });
      await expect(first.waitUntilFinished(events, 10_000)).resolves.toEqual({
        processedTenantId: 'tenant-proof',
      });
      expect(first.id).toBe(duplicate.id);
      expect(calls).toBe(1);

      const retry = await queue.add('retry', { tenantId: 'tenant-proof' }, { jobId: 'analytics-retry-proof' });
      await expect(retry.waitUntilFinished(events, 10_000)).resolves.toEqual({
        processedTenantId: 'tenant-proof',
      });
      expect((await queue.getJob('analytics-retry-proof'))?.attemptsMade).toBe(3);
      expect((await queue.getJob('analytics-retry-proof'))?.opts.backoff).toEqual({
        type: 'exponential',
        delay: 50,
      });
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
