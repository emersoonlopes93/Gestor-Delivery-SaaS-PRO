import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { DeliveryModule } from '../delivery/delivery.module';

import { OpenAiProvider } from './providers/openai.provider';
import { AI_PROVIDER } from './interfaces/ai-provider.interface';

import { AiAgentConfigService } from './services/ai-agent-config.service';
import { ConversationService } from './services/conversation.service';
import { AgentToolsService } from './services/agent-tools.service';
import { AiOrchestratorService } from './services/ai-orchestrator.service';

@Module({
  imports: [
    DatabaseModule,
    WhatsAppChannelModule, // para enviar as mensagens de volta
    CatalogModule,         // para as tools lerem produtos
    OrdersModule,          // para as tools criarem pedidos
    StorefrontModule,      // para checkout e validação
    DeliveryModule,        // para calcular taxas de entrega
  ],
  providers: [
    OpenAiProvider,
    {
      provide: AI_PROVIDER,
      useClass: OpenAiProvider, // Default
    },
    AiAgentConfigService,
    ConversationService,
    AgentToolsService,
    AiOrchestratorService,
  ],
  exports: [
    AiAgentConfigService,
    ConversationService,
    AiOrchestratorService,
  ],
})
export class AiAgentModule {}
