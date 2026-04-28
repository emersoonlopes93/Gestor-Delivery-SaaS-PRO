import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [WhatsappWebhookController, PushController],
  providers: [WhatsappService, PushService],
  exports: [WhatsappService, PushService],
})
export class NotificationsModule {}
