import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { CampaignsService } from './services/campaigns.service';
import { CampaignDispatcherService } from './services/campaign-dispatcher.service';

@Module({
  imports: [
    DatabaseModule,
    WhatsAppChannelModule, // para enviar as mensagens das campanhas
  ],
  providers: [
    CampaignsService,
    CampaignDispatcherService,
  ],
  exports: [
    CampaignsService,
    CampaignDispatcherService,
  ],
})
export class CampaignsModule {}
