import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { WhatsappService } from './whatsapp.service';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PushSubscriptionService } from './push-subscription.service';
import { PushNotificationProcessor } from './push-notification.processor';
import { NOTIFICATIONS_PUSH_QUEUE } from '@gestor/types';

const enablePushQueue =
  process.env.REDIS_ENABLED !== 'false' &&
  process.env.PUSH_NOTIFICATIONS_ENABLED === 'true';

if (enablePushQueue) {
  console.log('[QUEUE] push_notifications_queue_enabled');
} else {
  console.log('[QUEUE] push_notifications_queue_disabled');
}

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    WhatsAppChannelModule,
    ...(enablePushQueue
      ? [
          BullModule.registerQueue({
            name: NOTIFICATIONS_PUSH_QUEUE,
            defaultJobOptions: {
              removeOnComplete: 500,
              removeOnFail: 1000,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000, // 5s
              },
            },
          }),
        ]
      : []),
  ],
  controllers: [PushController],
  providers: [
    WhatsappService,
    PushService,
    PushSubscriptionService,
    ...(enablePushQueue ? [PushNotificationProcessor] : []),
  ],
  exports: [WhatsappService, PushService, PushSubscriptionService],
})
export class NotificationsModule {}
