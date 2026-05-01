import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { EvolutionGoProvider } from './providers/evolution-go.provider';
import { MetaCloudProvider } from './providers/meta-cloud.provider';
import { WHATSAPP_PROVIDER } from './interfaces/whatsapp-provider.interface';
import { WhatsAppInstanceService } from './services/whatsapp-instance.service';
import { WhatsAppSenderService } from './services/whatsapp-sender.service';
import { WhatsAppProviderRegistryService } from './services/whatsapp-provider-registry.service';
import { WhatsAppInstanceController } from './controllers/whatsapp-instance.controller';
import { WhatsAppWebhookController } from './controllers/whatsapp-webhook.controller';

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [WhatsAppInstanceController, WhatsAppWebhookController],
  providers: [
    EvolutionGoProvider,
    MetaCloudProvider,
    {
      provide: WHATSAPP_PROVIDER,
      useClass: EvolutionGoProvider, // provider padrão
    },
    WhatsAppInstanceService,
    WhatsAppSenderService,
    WhatsAppProviderRegistryService,
  ],
  exports: [
    WhatsAppInstanceService,
    WhatsAppSenderService,
    WhatsAppProviderRegistryService,
    WHATSAPP_PROVIDER,
    EvolutionGoProvider,
    MetaCloudProvider,
  ],
})
export class WhatsAppChannelModule {}
