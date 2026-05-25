import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ChatController } from './controllers/chat.controller';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { RbacModule } from '../rbac/rbac.module';
import { QuickRepliesService } from './services/quick-replies.service';

@Module({
  imports: [
    DatabaseModule,
    AiAgentModule, // para ConversationService
    RbacModule, // para PermissionsGuard e RbacService
  ],
  controllers: [ChatController],
  providers: [QuickRepliesService],
  exports: [QuickRepliesService],
})
export class ChatModule {}
