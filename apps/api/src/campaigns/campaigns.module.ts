import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { CampaignsService } from './services/campaigns.service';
import { CampaignDispatcherService } from './services/campaign-dispatcher.service';
import { CampaignProcessor } from './services/campaign.processor';
import { CampaignsController } from './controllers/campaigns.controller';
import { BullModule } from '@nestjs/bullmq';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    DatabaseModule,
    WhatsAppChannelModule, // para enviar as mensagens das campanhas
    RbacModule, // para PermissionsGuard e RbacService
    BullModule.registerQueue({
      name: 'campaign-dispatch',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000, // 10s
        },
      },
    }),
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    CampaignDispatcherService,
    CampaignProcessor,
  ],
  exports: [
    CampaignsService,
    CampaignDispatcherService,
  ],
})
export class CampaignsModule {}
