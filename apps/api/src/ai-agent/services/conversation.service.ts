import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChatState, MessageDirection } from '@prisma/client';

import { Prisma } from '@prisma/client';

export interface CreateMessageDto {
  sessionId: string;
  direction: MessageDirection;
  content: string;
  messageType?: string;
  externalId?: string;
  toolCalls?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger('ConversationService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Encontra a sessão ativa ou cria uma nova.
   */
  async getOrCreateSession(tenantId: string, customerPhone: string) {
    const session = await this.prisma.chatSession.upsert({
      where: {
        tenantId_customerPhone: { tenantId, customerPhone },
      },
      create: {
        tenantId,
        customerPhone,
        state: 'greeting',
        lastMessageAt: new Date(),
      },
      update: {
        lastMessageAt: new Date(),
      },
    });

    // Se estiver fechada ou já passada do tempo limite, pode precisar de reabertura (lógica tratada pelo orquestrador)
    return session;
  }

  /**
   * Carrega o histórico recente de mensagens de uma sessão.
   */
  async getRecentHistory(sessionId: string, limit: number = 20) {
    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }).then(messages => messages.reverse()); // Retorna ordem cronológica
  }

  /**
   * Registra uma nova mensagem no banco de dados.
   */
  async addMessage(dto: CreateMessageDto) {
    return this.prisma.chatMessage.create({
      data: {
        sessionId: dto.sessionId,
        direction: dto.direction,
        content: dto.content,
        messageType: dto.messageType || 'text',
        externalId: dto.externalId,
        toolCalls: dto.toolCalls,
        metadata: dto.metadata,
      },
    });
  }

  /**
   * Atualiza o estado da conversa (ex: de browsing_menu para checkout).
   */
  async updateSessionState(sessionId: string, state: ChatState, cartData?: Prisma.InputJsonValue) {
    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        state,
        ...(cartData !== undefined ? { cartData } : {}),
      },
    });
  }

  /**
   * Transfere o atendimento para humano (Handoff).
   */
  async activateHandoff(sessionId: string, reason?: string) {
    const session = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        handoffActive: true,
        handoffReason: reason || 'Solicitado pelo cliente',
        handoffAt: new Date(),
        state: 'handoff_human',
      },
    });
    this.logger.log(`Session ${sessionId} transferred to human operator.`);
    return session;
  }

  /**
   * Encerra o Handoff (volta para bot) ou encerra a sessão.
   */
  async deactivateHandoff(sessionId: string) {
    const session = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        handoffActive: false,
        handoffOperator: null,
      },
    });
    this.logger.log(`Handoff deactivated for session ${sessionId}. Bot is back.`);
    return session;
  }

  /**
   * Encerra a sessão totalmente.
   */
  async closeSession(sessionId: string) {
    const session = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        state: 'closed',
        closedAt: new Date(),
        handoffActive: false,
      },
    });
    this.logger.log(`Session ${sessionId} closed.`);
    return session;
  }
}
