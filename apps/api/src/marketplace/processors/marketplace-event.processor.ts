import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';
import { MarketplaceOrderIngestionService } from '../services/marketplace-order-ingestion.service';
import { MarketplaceStatusSyncService } from '../services/marketplace-status-sync.service';

@Processor(MARKETPLACE_EVENT_QUEUE)
export class MarketplaceEventProcessor extends WorkerHost {
  constructor(
    private readonly ingestionService: MarketplaceOrderIngestionService,
    private readonly statusSyncService: MarketplaceStatusSyncService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'order-status-sync') {
      return this.statusSyncService.processStatusSyncJob(job.data as {
        tenantId: string;
        orderId: string;
        status: string;
        reason?: string | null;
      });
    }

    return this.ingestionService.processInboxEvent((job.data as { eventInboxId: string }).eventInboxId);
  }
}
