import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { SchedulingModule } from '../scheduling/scheduling.module';

import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { AI_PROVIDER } from './interfaces/ai-provider.interface';
import { AiProviderRegistryService } from './services/ai-provider-registry.service';

import { AiAgentConfigService } from './services/ai-agent-config.service';
import { ConversationService } from './services/conversation.service';
import { AgentToolsService } from './services/agent-tools.service';
import { AiOrchestratorService } from './services/ai-orchestrator.service';

import { AiAgentController } from './controllers/ai-agent.controller';

@Module({
  imports: [
    DatabaseModule,
    RbacModule,
    forwardRef(() => WhatsAppChannelModule), // para enviar as mensagens de volta
    CatalogModule,         // para as tools lerem produtos
    OrdersModule,          // para as tools criarem pedidos
    StorefrontModule,      // para checkout e validação
    DeliveryModule,        // para calcular taxas de entrega
    PromotionsModule,      // para cashback e cupons
    SchedulingModule,      // para agendamentos
  ],
  controllers: [AiAgentController],
  providers: [
    OpenAiProvider,
    AnthropicProvider,
    AiProviderRegistryService,
    {
      provide: AI_PROVIDER,
      useClass: OpenAiProvider, // Mantido para compatibilidade, mas o Registry deve ser preferido
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
    AiProviderRegistryService,
  ],
})
export class AiAgentModule {}
