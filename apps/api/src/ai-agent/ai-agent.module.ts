import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { ChatModule } from '../chat/chat.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { StorefrontModule } from '../storefront/storefront.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AdminModulesModule } from '../admin/modules/admin-modules.module';

import { OpenAiProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { GoogleAiProvider } from './providers/google-ai.provider';
import { AI_PROVIDER } from './interfaces/ai-provider.interface';
import { AiProviderRegistryService } from './services/ai-provider-registry.service';

import { AiAgentConfigService } from './services/ai-agent-config.service';
import { ConversationService } from './services/conversation.service';
import { AgentToolsService } from './services/agent-tools.service';
import { AgentToolsFilterService } from './services/agent-tools-filter.service';
import { AiOrchestratorService } from './services/ai-orchestrator.service';

import { AiAgentController } from './controllers/ai-agent.controller';
import { AiConfigDiagnosticsService } from './services/ai-config-diagnostics.service';

@Module({
  imports: [
    DatabaseModule,
    RbacModule,
    forwardRef(() => ChatModule),            // para WebSocket events
    forwardRef(() => WhatsAppChannelModule), // para enviar as mensagens de volta
    forwardRef(() => CatalogModule),         // para as tools lerem produtos
    forwardRef(() => OrdersModule),          // para as tools criarem pedidos
    forwardRef(() => StorefrontModule),      // para checkout e validação
    forwardRef(() => DeliveryModule),        // para calcular taxas de entrega
    forwardRef(() => PromotionsModule),      // para cashback e cupons
    forwardRef(() => SchedulingModule),      // para agendamentos
    AdminModulesModule,                      // para verificar permissões de módulo
  ],
  controllers: [AiAgentController],
  providers: [
    AiConfigDiagnosticsService,
    OpenAiProvider,
    AnthropicProvider,
    GoogleAiProvider,
    AiProviderRegistryService,
    {
      provide: AI_PROVIDER,
      useClass: OpenAiProvider, // Mantido para compatibilidade, mas o Registry deve ser preferido
    },
    AiAgentConfigService,
    ConversationService,
    AgentToolsFilterService,
    AgentToolsService,
    AiOrchestratorService,
  ],
  exports: [
    AiAgentConfigService,
    ConversationService,
    AgentToolsService,
    AiOrchestratorService,
    AiProviderRegistryService,
  ],
})
export class AiAgentModule {}
