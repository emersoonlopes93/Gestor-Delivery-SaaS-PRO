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
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import { ConversationService, CreateMessageDto } from '../../ai-agent/services/conversation.service';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';
import { QuickRepliesService } from '../services/quick-replies.service';
import { CreateQuickReplyDto, UpdateQuickReplyDto } from '../dto/quick-reply.dto';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';

type TenantRequest = ExpressRequest & { user: TenantJwtPayload };

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly prisma: PrismaService,
    private readonly quickRepliesService: QuickRepliesService,
    private readonly whatsappSender: WhatsAppSenderService,
  ) {}

  private asJsonObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
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

  @Get('sessions')
  @Permissions('orders.read')
  async listSessions(@Request() req: TenantRequest) {
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

    return sessions.map((s) => {
      const aiSummary = this.buildAiSummary(s.metadata);
      return {
        id: s.id,
        customerPhone: s.customerPhone,
        state: s.state,
        lastMessageAt: s.lastMessageAt,
        lastMessage: s.messages[0]?.content || null,
        handoffActive: s.handoffActive,
        aiAttentionRequired: aiSummary.attentionRequired,
        aiBlockedTools: aiSummary.blockedTools,
        aiLastFailureAt: aiSummary.lastFailureAt,
        aiToolFailures: aiSummary.failures,
      };
    });
  }

  @Get('sessions/:id')
  @Permissions('orders.read')
  async getSession(@Request() req: TenantRequest, @Param('id') sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, tenantId: req.user.tenantId },
    });
    return session;
  }

  @Get('sessions/:id/messages')
  @Permissions('orders.read')
  async getMessages(@Request() req: TenantRequest, @Param('id') sessionId: string) {
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        sessionId,
        session: { tenantId: req.user.tenantId },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    return messages;
  }

  @Get('sessions/:id/ai/summary')
  @Permissions('orders.read')
  async getAiSummary(@Param('id') sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    return this.buildAiSummary(session?.metadata);
  }

  @Post('sessions/:id/ai/failures/reset')
  @HttpCode(200)
  @Permissions('orders.read')
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
  @Permissions('orders.read')
  async activateHandoff(
    @Param('id') sessionId: string,
    @Body('reason') reason?: string,
  ) {
    await this.conversationService.activateHandoff(sessionId, reason);
    return { message: 'Handoff ativado' };
  }

  @Post('sessions/:id/handoff/deactivate')
  @HttpCode(200)
  @Permissions('orders.read')
  async deactivateHandoff(@Param('id') sessionId: string) {
    await this.conversationService.deactivateHandoff(sessionId);
    return { message: 'Handoff desativado' };
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  @Permissions('orders.read')
  async closeSession(@Param('id') sessionId: string) {
    await this.conversationService.closeSession(sessionId);
    return { message: 'Sessão encerrada' };
  }

  @Post('sessions/:id/messages')
  @HttpCode(200)
  @Permissions('orders.read')
  async sendMessage(
    @Request() req: TenantRequest,
    @Param('id') sessionId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, tenantId: req.user.tenantId },
      select: { id: true, tenantId: true, customerPhone: true, handoffActive: true },
    });
    if (!session) {
      return { error: 'Sessão não encontrada' };
    }

    // Envio real para WhatsApp
    const sendResult = await this.whatsappSender.sendText(session.tenantId, {
      to: session.customerPhone,
      text: dto.content,
    });

    const externalId = sendResult.success ? sendResult.messageId : undefined;

    const message = await this.conversationService.addMessage({
      sessionId,
      direction: 'outbound',
      content: dto.content,
      messageType: dto.messageType || 'text',
      externalId,
      metadata: {
        ...(dto.metadata && typeof dto.metadata === 'object' ? dto.metadata : {}),
        whatsapp: {
          sent: sendResult.success,
          error: sendResult.success ? null : sendResult.error,
        },
      },
    });

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { lastMessageAt: new Date() },
    });

    return message;
  }

  // --- Quick Replies ---

  @Get('quick-replies')
  @Permissions('orders.read')
  async listQuickReplies(@Request() req: TenantRequest) {
    return this.quickRepliesService.findAll(req.user.tenantId);
  }

  @Post('quick-replies')
  @Permissions('orders.read')
  async createQuickReply(@Request() req: TenantRequest, @Body() dto: CreateQuickReplyDto) {
    return this.quickRepliesService.create(req.user.tenantId, dto);
  }

  @Put('quick-replies/:id')
  @Permissions('orders.read')
  async updateQuickReply(
    @Request() req: TenantRequest,
    @Param('id') id: string,
    @Body() dto: UpdateQuickReplyDto
  ) {
    return this.quickRepliesService.update(req.user.tenantId, id, dto);
  }

  @Delete('quick-replies/:id')
  @Permissions('orders.read')
  async deleteQuickReply(@Request() req: TenantRequest, @Param('id') id: string) {
    return this.quickRepliesService.delete(req.user.tenantId, id);
  }

  @Post('quick-replies/:id/usage')
  @HttpCode(200)
  @Permissions('orders.read')
  async incrementUsage(@Param('id') id: string) {
    return this.quickRepliesService.incrementUsage(id);
  }

  @Post('dev/clear-handoffs')
  @HttpCode(200)
  @Permissions('orders.read')
  async devClearHandoffs(@Request() req: TenantRequest) {
    const tenantId = req.user.tenantId;
    await this.prisma.chatSession.updateMany({
      where: { tenantId, handoffActive: true },
      data: { handoffActive: false, handoffOperator: null },
    });
    return { success: true, message: 'All handoffs cleared' };
  }
}
