import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';
import { MarketplaceOrderIngestionService } from '../services/marketplace-order-ingestion.service';
import { MarketplaceStatusSyncService } from '../services/marketplace-status-sync.service';
import type { MarketplaceStatusJob } from '../services/marketplace-status-sync.service';
import { IfoodApiError } from '../providers/ifood-api.error';
import { MarketplaceReconciliationService } from '../services/marketplace-reconciliation.service';
import { MarketplacePollingService } from '../services/marketplace-polling.service';
import type { MarketplacePollingJob } from '../services/marketplace-polling.service';

export function marketplaceBackoffStrategy(attemptsMade: number, type?: string, error?: Error): number {
  const exponentialDelay = 5000 * (2 ** Math.max(0, attemptsMade - 1));
  if (type === 'ifood-retry-after' && error instanceof IfoodApiError && error.retryAfterMs) {
    return Math.max(exponentialDelay, error.retryAfterMs);
  }
  return exponentialDelay;
}

@Processor(MARKETPLACE_EVENT_QUEUE, {
  settings: { backoffStrategy: marketplaceBackoffStrategy },
  concurrency: 5,
})
export class MarketplaceEventProcessor extends WorkerHost {
  constructor(
    private readonly ingestionService: MarketplaceOrderIngestionService,
    private readonly statusSyncService: MarketplaceStatusSyncService,
    private readonly reconciliationService: MarketplaceReconciliationService,
    private readonly pollingService: MarketplacePollingService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'order-status-sync') {
      return this.statusSyncService.processStatusSyncJob(job.data as MarketplaceStatusJob, job.id);
    }

    if (job.name === 'operation-reconciliation-scan') {
      return this.reconciliationService.reconcileBatch(100);
    }

    if (job.name === 'ifood-polling-scan') {
      return this.pollingService.scheduleEligibleConnections();
    }

    if (job.name === 'ifood-poll-connection') {
      return this.pollingService.runConnection(job.data as MarketplacePollingJob, job.attemptsMade > 0);
    }

    const data = job.data as { eventInboxId: string; tenantId?: string | null };
    return this.ingestionService.processInboxEvent(data.eventInboxId);
  }
}
