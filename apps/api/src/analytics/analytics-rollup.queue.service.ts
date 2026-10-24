import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ANALYTICS_DAILY_ROLLUP_JOB,
  ANALYTICS_ROLLUP_QUEUE,
  AnalyticsRollupJobV1Schema,
  type AnalyticsRollupJobV1,
} from '@gestor/types';
import { Queue } from 'bullmq';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service';
import {
  analyticsRollupIntervalMs,
  analyticsRollupRecentDays,
  isAnalyticsRollupSchedulerEnabled,
} from './analytics-rollup.config';

export function analyticsRollupJobId(
  data: Pick<AnalyticsRollupJobV1, 'tenantId' | 'fromDate' | 'toDate' | 'reason'>,
): string {
  return `analytics-rollup__${data.tenantId}__${data.fromDate}__${data.toDate}__${data.reason}`;
}

@Injectable()
export class AnalyticsRollupQueueService {
  constructor(
    @InjectQueue(ANALYTICS_ROLLUP_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(
    candidate: AnalyticsRollupJobV1,
    options: { schedulerSlot?: number } = {},
  ): Promise<{ jobId: string }> {
    const data = AnalyticsRollupJobV1Schema.parse(candidate);
    const baseJobId = analyticsRollupJobId(data);
    const jobId = options.schedulerSlot === undefined
      ? baseJobId
      : `${baseJobId}__slot-${options.schedulerSlot}`;
    await this.queue.add(ANALYTICS_DAILY_ROLLUP_JOB, data, {
      jobId,
      ...(options.schedulerSlot === undefined
        ? {}
        : { removeOnComplete: { age: 24 * 60 * 60, count: 10_000 } }),
    });
    return { jobId };
  }
}

@Injectable()
export class AnalyticsRollupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsRollupSchedulerService.name);
  private interval: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: AnalyticsRollupQueueService,
  ) {}

  onModuleInit(): void {
    if (!isAnalyticsRollupSchedulerEnabled()) return;
    void this.enqueueRecentWindows();
    this.interval = setInterval(() => {
      void this.enqueueRecentWindows();
    }, analyticsRollupIntervalMs());
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async enqueueRecentWindows(now = DateTime.utc()): Promise<number> {
    const schedulerSlot = Math.floor(now.toMillis() / analyticsRollupIntervalMs());
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, settings: { select: { timezone: true } } },
      orderBy: { id: 'asc' },
      take: 10_000,
    });
    let enqueued = 0;
    for (const tenant of tenants) {
      const timezone = tenant.settings?.timezone?.trim() || 'America/Sao_Paulo';
      const localToday = now.setZone(timezone).startOf('day');
      if (!localToday.isValid) {
        this.logger.error(`analytics_rollup_scheduler_invalid_timezone tenantId=${tenant.id}`);
        continue;
      }
      const toDate = localToday.toISODate() as string;
      const fromDate = localToday.minus({ days: analyticsRollupRecentDays() - 1 }).toISODate() as string;
      await this.queue.enqueue(
        {
          tenantId: tenant.id,
          fromDate,
          toDate,
          timezone,
          reason: 'late-event-recompute',
          requestedAt: now.toISO() as string,
        },
        { schedulerSlot },
      );
      enqueued += 1;
    }
    this.logger.log(`analytics_rollup_scheduler_complete tenantCount=${tenants.length} enqueued=${enqueued}`);
    return enqueued;
  }
}
