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
import { Food99PollingService, type Food99PollingJob } from '../services/food99-polling.service';
import { Food99ApiError } from '../providers/food99-api.error';
import { Food99FinancialAutoSyncService, type Food99FinancialAutoSyncJob } from '../services/food99-financial-auto-sync.service';
import { FOOD99_FINANCIAL_AUTO_SYNC_CONNECTION_JOB, FOOD99_FINANCIAL_AUTO_SYNC_SCAN_JOB } from '../marketplace.constants';

export function marketplaceBackoffStrategy(attemptsMade: number, type?: string, error?: Error): number {
  const exponentialDelay = 5000 * (2 ** Math.max(0, attemptsMade - 1));
  if (type === 'ifood-retry-after' && error instanceof IfoodApiError && error.retryAfterMs) {
    return Math.max(exponentialDelay, error.retryAfterMs);
  }
  if (type === 'food99-retry-after' && error instanceof Food99ApiError && error.retryAfterMs) {
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
    private readonly food99PollingService: Food99PollingService,
    private readonly food99FinancialAutoSync: Food99FinancialAutoSyncService,
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

    if (job.name === 'ifood-poll-token-device') {
      return this.pollingService.runConnection(job.data as MarketplacePollingJob, job.attemptsMade > 0);
    }

    if (job.name === 'food99-polling-scan') {
      return this.food99PollingService.scheduleEligibleConnections();
    }

    if (job.name === 'food99-poll-connection') {
      return this.food99PollingService.runConnection(job.data as Food99PollingJob);
    }

    if (job.name === FOOD99_FINANCIAL_AUTO_SYNC_SCAN_JOB) {
      return this.food99FinancialAutoSync.scheduleEligibleConnections();
    }

    if (job.name === FOOD99_FINANCIAL_AUTO_SYNC_CONNECTION_JOB) {
      return this.food99FinancialAutoSync.runConnection(job.data as Food99FinancialAutoSyncJob);
    }

    const data = job.data as { eventInboxId: string; tenantId?: string | null };
    return this.ingestionService.processInboxEvent(data.eventInboxId);
  }
}
