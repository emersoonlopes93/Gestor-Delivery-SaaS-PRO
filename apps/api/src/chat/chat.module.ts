import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ChatController } from './controllers/chat.controller';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { RbacModule } from '../rbac/rbac.module';
import { QuickRepliesService } from './services/quick-replies.service';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => AiAgentModule), // para ConversationService
    RbacModule, // para PermissionsGuard e RbacService
    WhatsAppChannelModule, // para WhatsAppSenderService
  ],
  controllers: [ChatController],
  providers: [QuickRepliesService, ChatGateway],
  exports: [QuickRepliesService, ChatGateway],
})
export class ChatModule {}
