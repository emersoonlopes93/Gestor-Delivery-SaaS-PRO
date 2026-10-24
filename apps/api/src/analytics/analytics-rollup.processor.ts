import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ANALYTICS_DAILY_ROLLUP_JOB,
  ANALYTICS_ROLLUP_QUEUE,
  AnalyticsRollupJobV1Schema,
} from '@gestor/types';
import { Job } from 'bullmq';
import { AnalyticsRollupService } from './analytics-rollup.service';

@Processor(ANALYTICS_ROLLUP_QUEUE, { concurrency: 2 })
export class AnalyticsRollupProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsRollupProcessor.name);

  constructor(private readonly rollup: AnalyticsRollupService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== ANALYTICS_DAILY_ROLLUP_JOB) {
      throw new Error('analytics_rollup_unknown_job');
    }
    const data = AnalyticsRollupJobV1Schema.parse(job.data);
    this.logger.log(
      `analytics_rollup_job_started jobId=${job.id ?? 'unassigned'} tenantId=${data.tenantId}`
      + ` from=${data.fromDate} to=${data.toDate} reason=${data.reason} retry=${job.attemptsMade}`,
    );
    return this.rollup.recomputeRange(data);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(
      `analytics_rollup_job_failed code=ANALYTICS_ROLLUP_FAILED`
      + ` jobId=${job?.id ?? 'unknown'} retry=${job?.attemptsMade ?? 0} error=${error.message}`,
    );
  }
}
