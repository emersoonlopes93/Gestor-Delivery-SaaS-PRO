import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  UseGuards,
  Request,
  Logger,
  Query,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { ChatSession, Prisma } from '@prisma/client';
import type { TenantJwtPayload } from '@gestor/types';
import { ConversationService, CreateMessageDto } from '../../ai-agent/services/conversation.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { QuickRepliesService } from '../services/quick-replies.service';
import { CreateQuickReplyDto, UpdateQuickReplyDto } from '../dto/quick-reply.dto';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';
import { ChatGateway } from '../chat.gateway';

type TenantRequest = ExpressRequest & { user: TenantJwtPayload };

@Controller('chat')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('whatsapp_advanced')
export class ChatController {
  private readonly logger = new Logger('ChatController');
  constructor(
    private readonly conversationService: ConversationService,
    private readonly prisma: PrismaService,
    private readonly quickRepliesService: QuickRepliesService,
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly chatGateway: ChatGateway,
  ) {}

  private asJsonObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private isInboxMessage(message: { metadata?: unknown }): boolean {
    const metadata = this.asJsonObject(message.metadata);
    if (metadata.hiddenFromInbox === true) {
      return false;
    }
    const type = typeof metadata.type === 'string' ? metadata.type : undefined;
    return type !== 'tool_call' && type !== 'tool_result';
  }

  private buildAiSummary(metadata: unknown): {
    attentionRequired: boolean;
    blockedTools: string[];
    lastFailureAt: string | null;
    failures: Array<{
      toolName: string;
      count: number;
      lastAt: string;
      lastErrorCode?: string;
      lastSignatureHash?: string;
      isRecent: boolean;
      wouldBlock: boolean;
    }>;
  } {
    const nowMs = Date.now();
    const windowMs = 5 * 60 * 1000;

    const meta = this.asJsonObject(metadata);
    const ai = this.asJsonObject(meta.ai);
    const toolFailures = this.asJsonObject(ai.toolFailures);

    const failures: Array<{
      toolName: string;
      count: number;
      lastAt: string;
      lastErrorCode?: string;
      lastSignatureHash?: string;
      isRecent: boolean;
      wouldBlock: boolean;
    }> = [];

    for (const toolName of Object.keys(toolFailures)) {
      const entry = this.asJsonObject(toolFailures[toolName]);
      const count = typeof entry.count === 'number' ? entry.count : null;
      const lastAt = typeof entry.lastAt === 'string' ? entry.lastAt : null;
      if (count === null || lastAt === null) continue;

      const lastAtMs = Date.parse(lastAt);
      const isRecent = Number.isFinite(lastAtMs) ? (nowMs - lastAtMs <= windowMs) : false;
      const wouldBlock = isRecent && count >= 2;

      failures.push({
        toolName,
        count,
        lastAt,
        lastErrorCode: typeof entry.lastErrorCode === 'string' ? entry.lastErrorCode : undefined,
        lastSignatureHash: typeof entry.lastSignatureHash === 'string' ? entry.lastSignatureHash : undefined,
        isRecent,
        wouldBlock,
      });
    }

    failures.sort((a, b) => {
      const aMs = Date.parse(a.lastAt);
      const bMs = Date.parse(b.lastAt);
      if (Number.isFinite(aMs) && Number.isFinite(bMs)) return bMs - aMs;
      return b.count - a.count;
    });

    const lastFailureAt = failures.length > 0 ? failures[0].lastAt : null;
    const blockedTools = failures.filter((f) => f.wouldBlock).map((f) => f.toolName);
    const attentionRequired = blockedTools.length > 0 || failures.some((f) => f.isRecent && f.count > 0);

    return {
      attentionRequired,
      blockedTools,
      lastFailureAt,
      failures,
    };
  }

  @Get('stats')
  @Permissions('chat.read')
  async getStats(@Request() req: TenantRequest) {
    const tenantId = req.user.tenantId;

    const latestSessions = await this.prisma.chatSession.findMany({
      where: { tenantId },
      orderBy: { lastMessageAt: 'desc' },
      distinct: ['customerPhone'],
      select: {
        state: true,
        handoffActive: true,
        unreadCount: true,
        lastMessageAt: true,
      }
    });

    let unreadCount = 0;
    let humanCount = 0;
    let aiCount = 0;
    let closedTodayCount = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const s of latestSessions) {
      if (s.unreadCount > 0) unreadCount++;
      if (s.handoffActive) humanCount++;
      else if (!['closed', 'expired'].includes(s.state)) aiCount++;
      
      if (['closed', 'expired'].includes(s.state) && s.lastMessageAt >= today) {
        closedTodayCount++;
      }
    }

    return {
      unread: unreadCount,
      human: humanCount,
      ai: aiCount,
      closedToday: closedTodayCount,
    };
  }

  @Get('sessions')
  @Permissions('chat.read')
  async listSessions(
    @Request() req: TenantRequest,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('period') period?: string,
  ) {
    const page = parseInt(pageStr || '1', 10);
    const limit = parseInt(limitStr || '50', 10);
    const skip = (page - 1) * limit;

    const where: Prisma.ChatSessionWhereInput = { tenantId: req.user.tenantId };

    if (search) {
      where.OR = [
        { customerPhone: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      if (status === 'ai_active') {
        where.state = { notIn: ['handoff_human', 'closed', 'expired'] };
        where.handoffActive = false;
      } else if (status === 'human') {
        where.handoffActive = true;
      } else if (status === 'closed') {
        where.state = { in: ['closed', 'expired'] };
      } else if (status === 'waiting') {
        where.handoffActive = true; // Aguardando Humano = Handoff
      }
    }

    if (period) {
      const now = new Date();
      if (period === 'today') {
        now.setHours(0, 0, 0, 0);
        where.lastMessageAt = { gte: now };
      } else if (period === 'yesterday') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        where.lastMessageAt = { gte: yesterday, lt: now };
      } else if (period === '7days') {
        now.setDate(now.getDate() - 7);
        where.lastMessageAt = { gte: now };
      } else if (period === '30days') {
        now.setDate(now.getDate() - 30);
        where.lastMessageAt = { gte: now };
      }
    }

    const sessions = await this.prisma.chatSession.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      distinct: ['customerPhone'],
      skip,
      take: limit,
      include: {
        customer: { select: { profilePictureUrl: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    const totalDistinct = await this.prisma.chatSession.groupBy({
      by: ['customerPhone'],
      where,
    });
    const total = totalDistinct.length;

    return {
      data: sessions.map((s) => {
        const visibleMessages = Array.isArray(s.messages)
          ? s.messages.filter((msg) => this.isInboxMessage(msg))
          : [];
        const aiSummary = this.buildAiSummary(s.metadata);
        return {
          id: s.id,
          customerPhone: s.customerPhone,
          displayName: s.displayName,
          state: s.state,
          lastMessageAt: s.lastMessageAt,
          lastMessage: visibleMessages[0]?.content || null,
          handoffActive: s.handoffActive,
          handoffUntil: s.handoffUntil,
          unreadCount: s.unreadCount,
          aiAttentionRequired: aiSummary.attentionRequired,
          aiBlockedTools: aiSummary.blockedTools,
          aiLastFailureAt: aiSummary.lastFailureAt,
          aiToolFailures: aiSummary.failures,
          profilePictureUrl: s.customer?.profilePictureUrl || null,
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }

  @Get('sessions/:id')
  @Permissions('chat.read')
  async getSession(@Request() req: TenantRequest, @Param('id') sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, tenantId: req.user.tenantId },
      include: { customer: { select: { profilePictureUrl: true } } },
    });
    if (!session) return null;
    // Achata profilePictureUrl para o nível raiz para que o frontend possa acessar
    const { customer, ...rest } = session;
    return {
      ...rest,
      profilePictureUrl: customer?.profilePictureUrl ?? null,
    };
  }

  @Get('sessions/:id/messages')
  @Permissions('chat.read')
  async getMessages(@Request() req: TenantRequest, @Param('id') sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, tenantId: req.user.tenantId },
    });
    if (!session) return [];

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        sessionId: sessionId,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    
    const finalMessages = messages.reverse().filter((msg) => this.isInboxMessage(msg));
    
    const marker = finalMessages.find(m => typeof m.content === 'string' && m.content.includes('TESTE-HISTORICO-OPERADOR-2406-001'));
    this.logger.log(`[CHAT_HISTORY] sessionId=${sessionId} count=${finalMessages.length} containsMarker=${!!marker} markerMessageId=${marker?.id || ''} markerDirection=${marker?.direction || ''} markerSenderType=${marker?.senderType || ''} markerFromMe=${marker?.direction === 'outbound'} order=desc take=200`);

    return finalMessages;
  }

  @Get('sessions/:id/ai/summary')
  @Permissions('chat.read')
  async getAiSummary(@Param('id') sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    return this.buildAiSummary(session?.metadata);
  }

  @Post('sessions/:id/ai/failures/reset')
  @HttpCode(200)
  @Permissions('chat.read')
  async resetAiFailures(
    @Param('id') sessionId: string,
    @Body('toolName') toolName?: string,
  ) {
    if (toolName) {
      await this.conversationService.clearAiToolFailures(sessionId, toolName);
    } else {
      await this.conversationService.clearAllAiToolFailures(sessionId);
    }
    return { message: 'AI failures reset' };
  }

  @Post('sessions/:id/handoff')
  @HttpCode(200)
  @Permissions('chat.manage_handoff')
  async activateHandoff(
    @Param('id') sessionId: string,
    @Body('reason') reason?: string,
  ) {
    await this.conversationService.activateHandoff(sessionId, reason);
    return { message: 'Handoff ativado' };
  }

  @Post('sessions/:id/handoff/deactivate')
  @HttpCode(200)
  @Permissions('chat.manage_handoff')
  async deactivateHandoff(@Param('id') sessionId: string) {
    await this.conversationService.deactivateHandoff(sessionId);
    return { message: 'Handoff desativado' };
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  @Permissions('chat.close')
  async closeSession(@Param('id') sessionId: string) {
    await this.conversationService.closeSession(sessionId);
    return { message: 'Sessão encerrada' };
  }

  @Post('sessions/:id/messages')
  @HttpCode(200)
  @Permissions('chat.send')
  async sendMessage(
    @Request() req: TenantRequest,
    @Param('id') sessionId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const tenantId = req.user.tenantId;
    // Generate a simple requestId for tracing
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.logger.log(`[CHAT_SEND] start requestId=${requestId} tenantId=${tenantId} sessionId=${sessionId}`);

    try {
      const session = await this.prisma.chatSession.findFirst({
        where: { id: sessionId, tenantId },
        select: { id: true, tenantId: true, customerPhone: true, handoffActive: true },
      });
      if (!session) {
        this.logger.warn(`[CHAT_SEND] error stage=session_not_found requestId=${requestId}`);
        return { error: 'Sessão não encontrada' };
      }
      this.logger.log(`[CHAT_SEND] session_loaded requestId=${requestId}`);

      // Envio real para WhatsApp
      this.logger.log(`[CHAT_SEND] evolution_send_start requestId=${requestId}`);
      const sendResult = await this.whatsappSender.sendText(session.tenantId, {
        to: session.customerPhone,
        text: dto.content,
      });
      this.logger.log(`[CHAT_SEND] evolution_send_success requestId=${requestId} status=${sendResult.success ? 'success' : 'failed'}`);

      const externalId = sendResult.success ? sendResult.messageId : undefined;

      this.logger.log(`[CHAT_SEND] message_persist_start requestId=${requestId} externalId=${externalId}`);
      const message = await this.conversationService.addMessage({
        sessionId,
        direction: 'outbound',
        senderType: 'human',
        content: dto.content,
        messageType: dto.messageType || 'text',
        externalId,
        externalStatus: sendResult.success ? 'sent' : 'failed',
        timestamp: new Date(),
        metadata: {
          ...(dto.metadata && typeof dto.metadata === 'object' ? dto.metadata : {}),
          whatsapp: {
            sent: sendResult.success,
            error: sendResult.success ? null : sendResult.error,
          },
        },
      });
      this.logger.log(`[CHAT_SEND] message_persist_success requestId=${requestId} messageId=${message.id}`);

      this.logger.log(`[CHAT_SEND] session_update_start requestId=${requestId}`);
      const config = await this.prisma.aiAgentConfig.findUnique({
        where: { tenantId: session.tenantId },
        select: { humanInterventionEnabled: true, humanInterventionMinutes: true },
      });

      const updateData: Prisma.ChatSessionUpdateInput = { 
        lastMessageAt: new Date(),
        state: 'handoff_human',
        closedAt: null, // Always reopen the session
      };

      if (config?.humanInterventionEnabled) {
        updateData.handoffActive = true;
        const minutes = config.humanInterventionMinutes || 60;
        updateData.handoffUntil = new Date(Date.now() + minutes * 60000);
      }

      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: updateData,
      });
      this.logger.log(`[CHAT_SEND] session_update_success requestId=${requestId}`);

      this.logger.log(`[CHAT_SEND] socket_emit_start requestId=${requestId}`);
      try {
        this.chatGateway.emitMessageCreated(session.tenantId, sessionId, message);
        this.logger.log(`[CHAT_SEND] socket_emit_success requestId=${requestId}`);
      } catch (wsErr: unknown) {
        this.logger.error(`[CHAT_SEND] socket_emit_failed requestId=${requestId} error=${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
      }

      const emittedSessionId = sessionId; // Always the URL's sessionId
      this.logger.log(`[CHAT_SEND] sessionIdFromUrl=${sessionId} persistedSessionId=${message.sessionId} emittedSessionId=${emittedSessionId}`);
      this.logger.log(`[CHAT_SEND] complete requestId=${requestId}`);

      const responseShape = message?.id ? 'raw_message' : 'wrapped_object';
      this.logger.log(`[CHAT_SEND_RESPONSE] sessionId=${message.sessionId} messageId=${message.id} externalId=${message.externalId || ''} direction=${message.direction} senderType=${message.senderType} fromMe=${message.direction === 'outbound'} contentLength=${typeof message.content === 'string' ? message.content.length : 0} createdAt=${message.createdAt} deletedAt=${message.deletedAt || ''} status=${message.externalStatus || ''} shape=${responseShape}`);

      return message;
    } catch (error: unknown) {
      const errName = error instanceof Error ? error.name : 'Unknown';
      const errMsg = error instanceof Error ? error.message : String(error);
      const errCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
      this.logger.error(`[CHAT_SEND] error requestId=${requestId} tenantId=${tenantId} sessionId=${sessionId} errorName=${errName} errorMessage=${errMsg} prismaCode=${errCode}`);
      throw error;
    }
  }

  @Post('sessions/:id/read')
  @HttpCode(200)
  @Permissions('chat.read')
  async markAsRead(@Request() req: TenantRequest, @Param('id') sessionId: string) {
    const tenantId = req.user.tenantId;
    const session = await this.prisma.chatSession.findFirst({ where: { id: sessionId, tenantId } });
    if (!session) {
      this.logger.log(`[CHAT_INBOX] session_mark_read_not_found sessionId=${sessionId} tenantId=${tenantId}`);
      return { error: 'Sessão não encontrada' };
    }

    await this.prisma.chatSession.update({ where: { id: sessionId }, data: { unreadCount: 0 } });

    const updated = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (updated) {
      try { this.chatGateway.emitSessionUpdated(tenantId, updated as ChatSession); } catch (e) { this.logger.error('Failed to emit sessionUpdated', e); }
    }

    this.logger.log(`[CHAT_INBOX] session_marked_read sessionId=${sessionId} tenantId=${tenantId}`);
    return { success: true };
  }

  // --- Quick Replies ---

  @Get('quick-replies')
  @Permissions('chat.read')
  async listQuickReplies(@Request() req: TenantRequest) {
    return this.quickRepliesService.findAll(req.user.tenantId);
  }

  @Post('quick-replies')
  @Permissions('chat.manage_quick_replies')
  async createQuickReply(@Request() req: TenantRequest, @Body() dto: CreateQuickReplyDto) {
    return this.quickRepliesService.create(req.user.tenantId, dto);
  }

  @Put('quick-replies/:id')
  @Permissions('chat.manage_quick_replies')
  async updateQuickReply(
    @Request() req: TenantRequest,
    @Param('id') id: string,
    @Body() dto: UpdateQuickReplyDto
  ) {
    return this.quickRepliesService.update(req.user.tenantId, id, dto);
  }

  @Delete('quick-replies/:id')
  @Permissions('chat.manage_quick_replies')
  async deleteQuickReply(@Request() req: TenantRequest, @Param('id') id: string) {
    return this.quickRepliesService.delete(req.user.tenantId, id);
  }

  @Post('quick-replies/:id/usage')
  @HttpCode(200)
  @Permissions('chat.read')
  async incrementUsage(@Param('id') id: string) {
    return this.quickRepliesService.incrementUsage(id);
  }

  @Post('dev/clear-handoffs')
  @HttpCode(200)
  @Permissions('chat.manage_handoff')
  async devClearHandoffs(@Request() req: TenantRequest) {
    const tenantId = req.user.tenantId;
    await this.prisma.chatSession.updateMany({
      where: { tenantId, handoffActive: true },
      data: { handoffActive: false, handoffOperator: null },
    });
    return { success: true, message: 'All handoffs cleared' };
  }
}
