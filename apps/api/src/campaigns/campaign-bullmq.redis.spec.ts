import { Queue, QueueEvents, Worker } from 'bullmq';

const redisUrl = process.env.CAMPAIGN_REDIS_TEST_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('campaign BullMQ ephemeral Redis proof', () => {
  jest.setTimeout(20_000);

  it('proves deterministic job IDs, bounded retry, final failure and restart recovery', async () => {
    const url = new URL(redisUrl as string);
    const connection = { host: url.hostname, port: Number(url.port) };
    const queueName = `campaign-proof-${Date.now()}`;
    const defaultJobOptions = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 50 },
      removeOnComplete: false,
      removeOnFail: false,
    };
    const queue = new Queue(queueName, { connection, defaultJobOptions });
    const events = new QueueEvents(queueName, { connection });
    await events.waitUntilReady();

    let worker: Worker | undefined;
    try {
      const original = await queue.add('idempotent', { tenantId: 'tenant-proof' }, { jobId: 'dispatch-proof' });
      const duplicate = await queue.add('idempotent', { tenantId: 'tenant-proof' }, { jobId: 'dispatch-proof' });
      let idempotentCalls = 0;
      worker = new Worker(queueName, async (job) => {
        if (job.name === 'idempotent') {
          idempotentCalls += 1;
          return { sent: true };
        }
        if (job.name === 'retry') {
          if (job.attemptsMade < 2) throw new Error('transient-proof');
          return { recovered: true };
        }
        throw new Error('permanent-proof');
      }, { connection });

      await expect(original.waitUntilFinished(events, 10_000)).resolves.toEqual({ sent: true });
      expect(original.id).toBe(duplicate.id);
      expect(idempotentCalls).toBe(1);

      const retry = await queue.add('retry', {}, { jobId: 'retry-proof' });
      await expect(retry.waitUntilFinished(events, 10_000)).resolves.toEqual({ recovered: true });
      expect((await queue.getJob('retry-proof'))?.attemptsMade).toBe(3);

      const permanent = await queue.add('permanent', {}, { jobId: 'permanent-proof' });
      await expect(permanent.waitUntilFinished(events, 10_000)).rejects.toThrow('permanent-proof');
      const failedJob = await queue.getJob('permanent-proof');
      expect(await failedJob?.getState()).toBe('failed');
      expect(failedJob?.attemptsMade).toBe(3);
      expect(failedJob?.opts.backoff).toEqual({ type: 'exponential', delay: 50 });

      await worker.close();
      worker = undefined;

      const recovery = await queue.add('recovery', {}, { jobId: 'restart-proof', delay: 100 });
      const recoveryWorker = new Worker(queueName, async () => ({ recoveredAfterRestart: true }), { connection });
      worker = recoveryWorker;
      await expect(recovery.waitUntilFinished(events, 10_000)).resolves.toEqual({ recoveredAfterRestart: true });
    } finally {
      await worker?.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
