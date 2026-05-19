import {
  Controller,
  Get,
  Post,
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

type TenantRequest = ExpressRequest & { user: TenantJwtPayload };

@Controller('chat')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ChatController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly prisma: PrismaService,
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

  @Get('sessions/:id/messages')
  @Permissions('orders.read')
  async getMessages(@Param('id') sessionId: string) {
    const messages = await this.conversationService.getRecentHistory(sessionId, 50);
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
