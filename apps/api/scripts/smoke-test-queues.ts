import { Queue, QueueEvents, Worker } from 'bullmq';
import { loadApiEnvFiles } from '../src/config/env-paths';

loadApiEnvFiles();

type SmokeJobData = {
  kind: 'success' | 'fail';
  runId: string;
};

type QueueSmokeReport = {
  queueName: string;
  checks: string[];
  warnings: string[];
  counts?: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
};

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'y'].includes(raw);
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function classifyRedisError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/quota|rate.?limit|too many|limit exceeded|request limit/i.test(message)) return 'quota_or_rate_limit';
  if (/auth|password|credential|unauthorized|invalid username|invalid password|noperm/i.test(message)) return 'authentication';
  if (/timeout|etimedout|econnrefused|enotfound|econnreset|network|socket/i.test(message)) return 'network_or_timeout';
  if (/closed|unavailable|offline|disconnect/i.test(message)) return 'unavailable';
  return 'unknown';
}

function buildConnection() {
  const host = process.env.REDIS_HOST?.trim();
  if (process.env.REDIS_ENABLED === 'false') {
    throw new Error('Redis is disabled: REDIS_ENABLED=false.');
  }
  if (!host) {
    throw new Error('Missing REDIS_HOST.');
  }
  if (!readBoolEnv('QUEUES_SMOKE_ALLOW_LOCAL_REDIS', false) && ['localhost', '127.0.0.1'].includes(host)) {
    throw new Error('REDIS_HOST points to localhost. Set QUEUES_SMOKE_ALLOW_LOCAL_REDIS=true only for local development.');
  }
  if (readBoolEnv('QUEUES_SMOKE_EXPECT_BULLMQ', true) && process.env.BULLMQ_ENABLED !== 'true') {
    throw new Error('BullMQ is disabled: BULLMQ_ENABLED must be true.');
  }

  const connectTimeout = readPositiveIntEnv('REDIS_CONNECT_TIMEOUT_MS', 3000);
  const maxAttempts = readPositiveIntEnv('REDIS_RECONNECT_MAX_ATTEMPTS', 3);
  const baseDelay = readPositiveIntEnv('REDIS_RECONNECT_BASE_DELAY_MS', 500);
  const maxDelay = readPositiveIntEnv('REDIS_RECONNECT_MAX_DELAY_MS', 5000);

  return {
    host,
    port: readPositiveIntEnv('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    connectTimeout,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(attempt: number) {
      if (attempt > maxAttempts) return null;
      return Math.min(baseDelay * 2 ** Math.max(0, attempt - 1), maxDelay);
    },
  };
}

async function main() {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const queueName = `queues-smoke-${runId}`;
  const report: QueueSmokeReport = {
    queueName,
    checks: [],
    warnings: [],
  };
  let queue: Queue<SmokeJobData> | undefined;
  let worker: Worker<SmokeJobData> | undefined;
  let queueEvents: QueueEvents | undefined;

  try {
    const connection = buildConnection();
    report.checks.push('redis env validated');
    report.checks.push('bullmq env validated');

    queue = new Queue<SmokeJobData>(queueName, {
      connection,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
        attempts: 1,
      },
    });
    queueEvents = new QueueEvents(queueName, { connection });
    worker = new Worker<SmokeJobData>(
      queueName,
      async (job) => {
        if (job.data.kind === 'fail') {
          throw new Error('controlled_queue_smoke_failure');
        }
        return { ok: true, runId: job.data.runId };
      },
      { connection },
    );

    await queueEvents.waitUntilReady();
    await worker.waitUntilReady();
    await queue.waitUntilReady();
    const client = await queue.client;
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis ping did not return PONG.');
    }
    report.checks.push('redis ping ok');

    const successJob = await queue.add('success', { kind: 'success', runId }, { jobId: `success-${runId}` });
    await successJob.waitUntilFinished(queueEvents, readPositiveIntEnv('QUEUES_SMOKE_JOB_TIMEOUT_MS', 15000));
    const successState = await successJob.getState();
    if (successState !== 'completed') {
      throw new Error(`Success job state must be completed, got ${successState}.`);
    }
    report.checks.push('smoke success job completed');

    const failedJob = await queue.add(
      'controlled-failure',
      { kind: 'fail', runId },
      { jobId: `fail-${runId}`, attempts: 2, backoff: { type: 'fixed', delay: 100 } },
    );
    try {
      await failedJob.waitUntilFinished(queueEvents, readPositiveIntEnv('QUEUES_SMOKE_JOB_TIMEOUT_MS', 15000));
      throw new Error('Controlled failure job unexpectedly completed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('controlled_queue_smoke_failure')) {
        throw error;
      }
    }
    const failureState = await failedJob.getState();
    if (failureState !== 'failed') {
      throw new Error(`Controlled failure job state must be failed, got ${failureState}.`);
    }
    report.checks.push('controlled failure registered');

    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    report.counts = {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    };
    report.checks.push('queue counts readable');

    await queue.obliterate({ force: true });
    report.checks.push('smoke queue cleaned');

    console.log('QUEUES_SMOKE_GO', JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('QUEUES_SMOKE_NO_GO');
    console.error(
      JSON.stringify(
        {
          message: error instanceof Error ? error.message : String(error),
          reason: classifyRedisError(error),
          report,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    if (worker) await worker.close().catch(() => undefined);
    if (queueEvents) await queueEvents.close().catch(() => undefined);
    if (queue) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close().catch(() => undefined);
    }
  }
}

main();
