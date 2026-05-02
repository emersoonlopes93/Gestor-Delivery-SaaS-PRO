import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { CampaignsService } from './services/campaigns.service';
import { CampaignDispatcherService } from './services/campaign-dispatcher.service';
import { CampaignsController } from './controllers/campaigns.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    DatabaseModule,
    WhatsAppChannelModule, // para enviar as mensagens das campanhas
    RbacModule, // para PermissionsGuard e RbacService
  ],
  controllers: [CampaignsController],
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
