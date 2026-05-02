import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConversationService, CreateMessageDto } from '../../ai-agent/services/conversation.service';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('sessions')
  @Permissions('orders.read')
  async listSessions(@Request() req: any) {
    // Lista últimas sessões do tenant com última mensagem e estado
    const sessions = await this.prisma.chatSession.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    return sessions.map((s: any) => ({
      id: s.id,
      customerPhone: s.customerPhone,
      state: s.state,
      lastMessageAt: s.lastMessageAt,
      lastMessage: s.messages[0]?.content || null,
      handoffActive: s.handoffActive,
    }));
  }

  @Get('sessions/:id/messages')
  @Permissions('orders.read')
  async getMessages(@Request() req: any, @Param('id') sessionId: string) {
    const messages = await this.conversationService.getRecentHistory(sessionId, 50);
    return messages;
  }

  @Post('sessions/:id/handoff')
  @HttpCode(200)
  @Permissions('orders.read')
  async activateHandoff(
    @Request() req: any,
    @Param('id') sessionId: string,
    @Body('reason') reason?: string,
  ) {
    await this.conversationService.activateHandoff(sessionId, reason);
    return { message: 'Handoff ativado' };
  }

  @Post('sessions/:id/handoff/deactivate')
  @HttpCode(200)
  @Permissions('orders.read')
  async deactivateHandoff(@Request() req: any, @Param('id') sessionId: string) {
    await this.conversationService.deactivateHandoff(sessionId);
    return { message: 'Handoff desativado' };
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  @Permissions('orders.read')
  async closeSession(@Request() req: any, @Param('id') sessionId: string) {
    await this.conversationService.closeSession(sessionId);
    return { message: 'Sessão encerrada' };
  }

  @Post('sessions/:id/messages')
  @HttpCode(200)
  @Permissions('orders.read')
  async sendMessage(
    @Request() req: any,
    @Param('id') sessionId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const message = await this.conversationService.addMessage({
      sessionId,
      direction: 'outbound',
      content: dto.content,
      messageType: dto.messageType || 'text',
      externalId: dto.externalId,
      metadata: dto.metadata,
    });
    return message;
  }
}
