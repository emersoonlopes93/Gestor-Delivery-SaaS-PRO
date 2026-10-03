import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as webpush from 'web-push';
import { PushSubscriptionService } from './push-subscription.service';
import { PushSubscription } from '@prisma/client';
import { NOTIFICATIONS_PUSH_QUEUE, PushNotificationJob } from '@gestor/types';

export interface PushMessagePayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly vapidPublicKey: string;
  private readonly vapidPrivateKey: string;
  private readonly vapidSubject: string;

  constructor(
    private readonly config: ConfigService,
    private readonly pushSubService: PushSubscriptionService,
    @Optional() @InjectQueue(NOTIFICATIONS_PUSH_QUEUE) private readonly pushQueue?: Queue,
  ) {
    this.vapidPublicKey = this.config.get<string>('VAPID_PUBLIC_KEY', '');
    this.vapidPrivateKey = this.config.get<string>('VAPID_PRIVATE_KEY', '');
    this.vapidSubject = this.config.get<string>('VAPID_SUBJECT', '');

    if (this.isConfigured) {
      webpush.setVapidDetails(
        this.vapidSubject,
        this.vapidPublicKey,
        this.vapidPrivateKey,
      );
    } else {
      this.logger.warn('Push Notifications are NOT configured. VAPID keys missing.');
    }
  }

  get isConfigured(): boolean {
    return !!(this.vapidPublicKey && this.vapidPrivateKey);
  }

  getPublicKey(): string {
    return this.vapidPublicKey;
  }

  /**
   * Dispara uma notificação push para uma subscription salva no banco.
   * Se retornar erro 404/410, a subscription será desativada/removida.
   */
  async sendNotification(
    subscription: PushSubscription,
    payload: PushMessagePayload,
  ): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('VAPID keys not configured. Skipping push notification.');
      return false;
    }

    try {
      const pushSubscription: webpush.PushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dhKey,
          auth: subscription.authKey,
        },
      };

      await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
      this.logger.debug(`Push sent to ${subscription.recipientType} ${subscription.recipientId}`);
      return true;
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      const statusCode = err.statusCode;

      if (statusCode === 404 || statusCode === 410) {
        this.logger.warn(`Subscription for endpoint ${subscription.endpoint} has expired or is invalid. Deleting.`);
        await this.pushSubService.deleteSubscription(subscription.id);
        return false;
      }

      const message = err.message || 'Unknown error';
      this.logger.error(`Failed to send push notification: ${message}`);
      return false;
    }
  }

  async enqueueDriverNotification(
    tenantId: string,
    driverId: string,
    payload: PushMessagePayload,
  ): Promise<void> {
    if (!this.pushQueue) {
      this.logger.warn('Push queue not available. Skipping enqueue.');
      return;
    }

    const jobData: PushNotificationJob = {
      type: 'send-to-recipient',
      tenantId,
      recipientType: 'driver',
      recipientId: driverId,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      icon: payload.icon,
      tag: payload.tag,
      url: payload.url,
    };

    try {
      await this.pushQueue.add('send_push', jobData);
    } catch (error) {
      this.logger.error(`Failed to enqueue push notification for driver ${driverId}`, error);
    }
  }
}
