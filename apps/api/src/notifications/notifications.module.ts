import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { WhatsappService } from './whatsapp.service';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
  imports: [ConfigModule, DatabaseModule, WhatsAppChannelModule],
  controllers: [PushController],
  providers: [WhatsappService, PushService],
  exports: [WhatsappService, PushService],
})
export class NotificationsModule {}
