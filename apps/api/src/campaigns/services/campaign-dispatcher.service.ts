import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';
import { CampaignJobData } from './campaign.processor';

const PENDING_STATUSES = ['queued', 'processing', 'sending', 'unknown'] as const;
const FAILURE_STATUSES = ['failed'] as const;

@Injectable()
export class CampaignDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('campaign-dispatch') private readonly campaignQueue: Queue,
  ) {}

  onModuleInit() {
    void this.campaignQueue.add('system-feed-queue', { isSystemJob: true }, {
      jobId: 'system-feed-queue', repeat: { every: 60000 },
    }).catch((error: unknown) => this.logger.error(`Unable to register campaign feeder: ${this.message(error)}`));
  }

  onModuleDestroy() {}

  async assertAvailable(): Promise<void> {
    try {
      await this.campaignQueue.waitUntilReady();
    } catch (error: unknown) {
      throw new ServiceUnavailableException(`Campaign queue unavailable: ${this.message(error)}`);
    }
  }

  async rescheduleDispatch(data: CampaignJobData, nextAttemptAt: Date): Promise<void> {
    await this.assertAvailable();
    if (!data.campaignId || !data.dispatchId) throw new Error('Cannot reschedule campaign job without campaign and dispatch ids.');
    await this.campaignQueue.add('dispatch-job', data, {
      jobId: `campaign-${data.campaignId}-dispatch-${data.dispatchId}-at-${nextAttemptAt.getTime()}`,
      delay: Math.max(0, nextAttemptAt.getTime() - Date.now()),
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async feedQueue(): Promise<void> {
    await this.assertAvailable();
    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: 'processing', OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
      select: { id: true, tenantId: true, type: true, messageTemplate: true, mediaUrl: true, mediaType: true },
    });
    for (const campaign of campaigns) {
      if (campaign.type === 'whatsapp_status') {
        await this.campaignQueue.add('status-job', { ...campaign, isStatus: true }, {
          jobId: `campaign-${campaign.id}-status`, attempts: 3, backoff: { type: 'exponential', delay: 5000 },
        });
        continue;
      }
      const dispatches = await this.prisma.campaignDispatch.findMany({
        where: { campaignId: campaign.id, status: 'queued', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        take: 50,
        include: { customer: { select: { name: true } } },
      });
      for (const dispatch of dispatches) {
        const claimed = await this.prisma.campaignDispatch.updateMany({
          where: { id: dispatch.id, status: 'queued' }, data: { status: 'processing' },
        });
        if (claimed.count === 0) continue;
        const data: CampaignJobData = {
          campaignId: campaign.id, dispatchId: dispatch.id, tenantId: campaign.tenantId,
          customerId: dispatch.customerId, phone: dispatch.phone, customerName: dispatch.customer.name,
          messageTemplate: campaign.messageTemplate, mediaUrl: campaign.mediaUrl, mediaType: campaign.mediaType,
        };
        try {
          await this.campaignQueue.add('dispatch-job', data, {
            jobId: `campaign-${campaign.id}-dispatch-${dispatch.id}-at-${now.getTime()}`,
            attempts: 3, backoff: { type: 'exponential', delay: 5000 },
          });
        } catch (error: unknown) {
          await this.prisma.campaignDispatch.updateMany({ where: { id: dispatch.id, status: 'processing' }, data: { status: 'queued' } });
          throw error;
        }
      }
      await this.finalizeCampaign(campaign.id, campaign.tenantId);
    }
  }

  async finalizeCampaign(campaignId: string, tenantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findFirst({ where: { id: campaignId, tenantId, status: 'processing' }, select: { id: true } });
      if (!campaign) return;
      const grouped = await tx.campaignDispatch.groupBy({ by: ['status'], where: { campaignId }, _count: { _all: true } });
      const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
      if (PENDING_STATUSES.some((status) => (counts.get(status) ?? 0) > 0)) return;
      const failed = FAILURE_STATUSES.some((status) => (counts.get(status) ?? 0) > 0);
      await tx.campaign.updateMany({
        where: { id: campaignId, tenantId, status: 'processing' },
        data: failed ? { status: 'failed' } : { status: 'completed', completedAt: new Date() },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private message(error: unknown): string { return error instanceof Error ? error.message : 'Unknown error'; }
}
