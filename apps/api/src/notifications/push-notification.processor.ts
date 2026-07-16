import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { NOTIFICATIONS_PUSH_QUEUE, PushNotificationJob } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { PushService } from './push.service';

@Processor(NOTIFICATIONS_PUSH_QUEUE)
export class PushNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(PushNotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushService,
  ) {
    super();
  }

  async process(job: Job<PushNotificationJob, { sent: number; failed: number }, string>) {
    const { tenantId, recipientType, recipientId, title, body, data, icon, tag, url } = job.data;

    this.logger.log(`[${job.id}] Processing push job for ${recipientType} ${recipientId} (tenant: ${tenantId})`);

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        tenantId,
        recipientType,
        recipientId,
        isActive: true,
      },
    });

    if (subscriptions.length === 0) {
      this.logger.debug(`No active push subscriptions found for ${recipientType} ${recipientId}`);
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
      const success = await this.pushService.sendNotification(subscription, {
        title,
        body,
        data,
        icon,
        tag,
        url,
      });

      if (success) {
        sent++;
        // Atualizar lastUsedAt sem bloquear
        this.prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastUsedAt: new Date() },
        }).catch((err) => this.logger.warn(`Failed to update lastUsedAt: ${(err as Error).message}`));
      } else {
        failed++;
      }
    }

    this.logger.log(`[${job.id}] Push result: ${sent} sent, ${failed} failed for ${recipientType} ${recipientId}`);
    return { sent, failed };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PushNotificationJob>, error: Error) {
    this.logger.error(`Push job ${job.id} failed: ${error.message}`);
  }
}
