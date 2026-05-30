import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChatState, MessageDirection, ChatSession, ChatMessage } from '@prisma/client';

import { Prisma } from '@prisma/client';
import type { AgentSessionContext } from './agent-tools.service';
import { ChatGateway } from '../../chat/chat.gateway';

export interface AiOrderDraft {
  items: Array<{
    productId: string;
    quantity: number;
    notes?: string | null;
    productName?: string | null;
  }>;
  fulfillmentType: 'delivery' | 'pickup' | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: {
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    complement: string | null;
    reference: string | null;
    lat: number | null;
    lng: number | null;
  };
  payment: {
    method: string | null;
    changeFor: number | null;
  };
  deliveryFee: number | null;
  subtotal: number | null;
  total: number | null;
  missingFields: string[];
  readyToConfirm: boolean;
  confirmationAskedAt: string | null;
}

// Tipos auxiliares para dados do metadata (JSON)
interface MetadataAi {
  lastAiProcessedAt?: string;
  lastProcessedMessageId?: string;
  pendingCustomerMessageIds?: unknown;
  currentIntent?: unknown;
  orderDraft?: unknown;
  lastKnownCustomerName?: string;
  lastKnownCustomerNameAt?: string;
  lastKnownAddress?: unknown;
  lastKnownAddressAt?: string;
  lastOrderId?: string;
  lastOrderSummary?: string;
  lastOrderCreatedAt?: string;
  toolFailures?: unknown;
}

interface MetadataOrderDraft {
  items?: unknown;
  fulfillmentType?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  deliveryAddress?: unknown;
  payment?: unknown;
  deliveryFee?: unknown;
  subtotal?: unknown;
  total?: unknown;
  missingFields?: unknown;
  readyToConfirm?: unknown;
  confirmationAskedAt?: unknown;
}

interface MetadataDeliveryAddress {
  street?: unknown;
  number?: unknown;
  neighborhood?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
  complement?: unknown;
  reference?: unknown;
  lat?: unknown;
  lng?: unknown;
}

interface MetadataPayment {
  method?: unknown;
  changeFor?: unknown;
}

interface MetadataLastKnownAddress {
  street?: unknown;
  number?: unknown;
  neighborhood?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
  complement?: unknown;
  reference?: unknown;
}

interface MetadataToolFailures {
  [key: string]: unknown;
}

interface MetadataToolFailureEntry {
  count?: unknown;
  lastAt?: unknown;
  lastSignatureHash?: unknown;
  lastErrorCode?: unknown;
}

export interface AiSessionMemory {
  lastAiProcessedAt: string | null;
  lastProcessedMessageId: string | null;
  pendingCustomerMessageIds: string[];
  currentIntent: 'order' | 'menu' | 'delivery_fee' | 'payment' | 'support' | null;
  orderDraft: AiOrderDraft;
  lastKnownCustomerName: string | null;
  lastKnownCustomerNameAt: string | null;
  lastKnownAddress: {
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    complement: string | null;
    reference: string | null;
  };
  lastKnownAddressAt: string | null;
  lastOrderId: string | null;
  lastOrderSummary: string | null;
  lastOrderCreatedAt: string | null;
}

export interface CreateMessageDto {
  sessionId: string;
  direction: MessageDirection;
  senderType?: 'customer' | 'ai' | 'human' | 'system';
  content: string;
  messageType?: string;
  externalId?: string;
  externalStatus?: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: Date;
  toolCalls?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

type AiToolFailureEntry = {
  count: number;
  lastAt: string;
  lastSignatureHash?: string;
  lastErrorCode?: string;
};

type AiToolFailuresMap = Record<string, AiToolFailureEntry>;

@Injectable()
export class ConversationService {
  private readonly logger = new Logger('ConversationService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Vincula telefone WhatsApp ao Customer do tenant (necessário para pedidos, status, fidelidade).
   */
  async resolveAgentSessionContext(
    tenantId: string,
    sessionId: string,
    customerPhone: string,
  ): Promise<AgentSessionContext> {
    const cleanPhone = customerPhone.replace(/\D/g, '');
    const customer = await this.prisma.customer.upsert({
      where: {
        tenantId_phone: { tenantId, phone: cleanPhone },
      },
      create: {
        tenantId,
        phone: cleanPhone,
        name: 'Cliente WhatsApp',
      },
      update: {},
      select: { id: true, name: true, phone: true },
    });

    return {
      sessionId,
      customerId: customer.id,
      customerPhone: customer.phone,
      customerName: customer.name,
    };
  }

  async getSessionById(sessionId: string) {
    return this.prisma.chatSession.findUnique({ where: { id: sessionId } });
  }

  async saveCustomerName(tenantId: string, customerPhone: string, name: string): Promise<void> {
    const cleanPhone = customerPhone.replace(/\D/g, '');
    await this.prisma.customer.upsert({
      where: { tenantId_phone: { tenantId, phone: cleanPhone } },
      create: { tenantId, phone: cleanPhone, name },
      update: { name },
    });
  }

  async saveLastKnownAddress(sessionId: string, address: AiSessionMemory['lastKnownAddress']): Promise<void> {
    await this.updateSessionAiMemory(sessionId, {
      lastKnownAddress: address,
      lastKnownAddressAt: new Date().toISOString(),
    });
  }

  async getSessionAiMemory(sessionId: string): Promise<AiSessionMemory> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });

    const metadata = this.asJsonObject<Record<string, unknown>>(session?.metadata);
    const ai = this.asJsonObject<MetadataAi>(metadata.ai);

    const draft = this.asJsonObject<MetadataOrderDraft>(ai.orderDraft);
    const deliveryAddress = this.asJsonObject<MetadataDeliveryAddress>(draft.deliveryAddress);
    const payment = this.asJsonObject<MetadataPayment>(draft.payment);
    const lastKnownAddress = this.asJsonObject<MetadataLastKnownAddress>(ai.lastKnownAddress);

    return {
      lastAiProcessedAt: typeof ai.lastAiProcessedAt === 'string' ? ai.lastAiProcessedAt : null,
      lastProcessedMessageId: typeof ai.lastProcessedMessageId === 'string' ? ai.lastProcessedMessageId : null,
      pendingCustomerMessageIds: Array.isArray(ai.pendingCustomerMessageIds)
        ? (ai.pendingCustomerMessageIds as string[])
        : [],
      currentIntent:
        ai.currentIntent === 'order' ||
        ai.currentIntent === 'menu' ||
        ai.currentIntent === 'delivery_fee' ||
        ai.currentIntent === 'payment' ||
        ai.currentIntent === 'support'
          ? ai.currentIntent
          : null,
      orderDraft: {
        items: Array.isArray(draft.items)
          ? (draft.items as Array<{
              productId: string;
              quantity: number;
              notes?: string;
              productName?: string;
            }>)
          : [],
        fulfillmentType:
          draft.fulfillmentType === 'delivery' || draft.fulfillmentType === 'pickup'
            ? draft.fulfillmentType
            : null,
        customerName: typeof draft.customerName === 'string' ? draft.customerName : null,
        customerPhone: typeof draft.customerPhone === 'string' ? draft.customerPhone : null,
        deliveryAddress: {
          street: typeof deliveryAddress.street === 'string' ? deliveryAddress.street : null,
          number: typeof deliveryAddress.number === 'string' ? deliveryAddress.number : null,
          neighborhood: typeof deliveryAddress.neighborhood === 'string' ? deliveryAddress.neighborhood : null,
          city: typeof deliveryAddress.city === 'string' ? deliveryAddress.city : null,
          state: typeof deliveryAddress.state === 'string' ? deliveryAddress.state : null,
          zipCode: typeof deliveryAddress.zipCode === 'string' ? deliveryAddress.zipCode : null,
          complement: typeof deliveryAddress.complement === 'string' ? deliveryAddress.complement : null,
          reference: typeof deliveryAddress.reference === 'string' ? deliveryAddress.reference : null,
          lat: typeof deliveryAddress.lat === 'number' ? deliveryAddress.lat : null,
          lng: typeof deliveryAddress.lng === 'number' ? deliveryAddress.lng : null,
        },
        payment: {
          method: typeof payment.method === 'string' ? payment.method : null,
          changeFor: typeof payment.changeFor === 'number' ? payment.changeFor : null,
        },
        deliveryFee: typeof draft.deliveryFee === 'number' ? draft.deliveryFee : null,
        subtotal: typeof draft.subtotal === 'number' ? draft.subtotal : null,
        total: typeof draft.total === 'number' ? draft.total : null,
        missingFields: Array.isArray(draft.missingFields)
          ? (draft.missingFields as string[])
          : [],
        readyToConfirm: draft.readyToConfirm === true,
        confirmationAskedAt:
          typeof draft.confirmationAskedAt === 'string' ? draft.confirmationAskedAt : null,
      },
      lastKnownCustomerName:
        typeof ai.lastKnownCustomerName === 'string' ? ai.lastKnownCustomerName : null,
      lastKnownCustomerNameAt:
        typeof ai.lastKnownCustomerNameAt === 'string' ? ai.lastKnownCustomerNameAt : null,
      lastKnownAddress: {
        street: typeof lastKnownAddress.street === 'string' ? lastKnownAddress.street : null,
        number: typeof lastKnownAddress.number === 'string' ? lastKnownAddress.number : null,
        neighborhood:
          typeof lastKnownAddress.neighborhood === 'string'
            ? lastKnownAddress.neighborhood
            : null,
        city: typeof lastKnownAddress.city === 'string' ? lastKnownAddress.city : null,
        state: typeof lastKnownAddress.state === 'string' ? lastKnownAddress.state : null,
        zipCode: typeof lastKnownAddress.zipCode === 'string' ? lastKnownAddress.zipCode : null,
        complement:
          typeof lastKnownAddress.complement === 'string'
            ? lastKnownAddress.complement
            : null,
        reference:
          typeof lastKnownAddress.reference === 'string'
            ? lastKnownAddress.reference
            : null,
      },
      lastKnownAddressAt:
        typeof ai.lastKnownAddressAt === 'string' ? ai.lastKnownAddressAt : null,
      lastOrderId: typeof ai.lastOrderId === 'string' ? ai.lastOrderId : null,
      lastOrderSummary: typeof ai.lastOrderSummary === 'string' ? ai.lastOrderSummary : null,
      lastOrderCreatedAt:
        typeof ai.lastOrderCreatedAt === 'string' ? ai.lastOrderCreatedAt : null,
    };
  }

  async updateSessionAiMemory(sessionId: string, update: Partial<AiSessionMemory>): Promise<void> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });

    const metadata = this.asJsonObject(session?.metadata);
    const ai = this.asJsonObject(metadata.ai);
    const nextAi = { ...ai, ...update } as Record<string, unknown>;
    metadata.ai = nextAi;

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { metadata: metadata as Prisma.InputJsonObject },
    });
  }

  /**
   * Encontra a sessão ativa ou cria uma nova.
   */
  private isSessionExpired(
    session: { state: ChatState; expiresAt: Date | null; lastMessageAt: Date },
    sessionTimeoutMin?: number,
  ) {
    // Verifica se sessão já está em estado terminal
    if (session.state === 'closed') {
      return true;
    }

    const timeout = sessionTimeoutMin ?? 120;
    if (timeout <= 0) {
      return false;
    }

    const expiresAt = session.expiresAt ?? new Date(session.lastMessageAt.getTime() + timeout * 60000);
    return expiresAt.getTime() <= Date.now();
  }

  async getOrCreateSession(
    tenantId: string,
    customerPhone: string,
    options?: {
      customerId?: string;
      displayName?: string;
      remoteJid?: string;
      sessionTimeoutMin?: number;
    },
  ) {
    const now = new Date();
    const activeSession = await this.prisma.chatSession.findFirst({
      where: {
        tenantId,
        customerPhone,
        state: { notIn: ['closed'] }, // Remove 'expired' which is not ChatState in older schemas
        closedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (activeSession) {
      if (this.isSessionExpired(activeSession, options?.sessionTimeoutMin)) {
        await this.expireSession(activeSession.id, 'timeout');
      } else {
        const updateData: Prisma.ChatSessionUpdateInput = {
          lastMessageAt: now,
        };
        if (options?.displayName) updateData.displayName = options.displayName;
        if (options?.remoteJid) updateData.remoteJid = options.remoteJid;
        if (options?.customerId) {
          updateData.customer = { connect: { id: options.customerId } };
        }
        if (options?.sessionTimeoutMin !== undefined) {
          updateData.expiresAt = new Date(now.getTime() + options.sessionTimeoutMin * 60000);
        }

        return this.prisma.chatSession.update({
          where: { id: activeSession.id },
          data: updateData,
        });
      }
    }

    const data: Prisma.ChatSessionCreateInput = {
      customerPhone,
      displayName: options?.displayName,
      remoteJid: options?.remoteJid,
      state: 'greeting',
      lastMessageAt: now,
      tenant: { connect: { id: tenantId } },
      expiresAt:
        options?.sessionTimeoutMin !== undefined
          ? new Date(now.getTime() + options.sessionTimeoutMin * 60000)
          : undefined,
    };

    if (options?.customerId) {
      data.customer = { connect: { id: options.customerId } };
    }

    return this.prisma.chatSession.create({ data });
  }

  async getRecentHistory(sessionId: string, limit: number = 20) {
    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }).then(messages => messages.reverse()); // Retorna ordem cronológica
  }

  /**
   * Helpers para criação centralizada de mensagens internas (tool calls e tool results)
   */
  async createInternalToolCallMessage(sessionId: string, toolCalls: Prisma.InputJsonValue[]) {
    return this.addMessage({
      sessionId,
      direction: 'outbound',
      senderType: 'system',
      content: '',
      messageType: 'tool_call',
      externalStatus: 'sent',
      timestamp: new Date(),
      toolCalls,
      metadata: {
        type: 'tool_call',
        hiddenFromInbox: true,
      },
    });
  }

  async createInternalToolResultMessage(
    sessionId: string,
    content: string,
    toolCallName: string,
    status: string,
  ) {
    return this.addMessage({
      sessionId,
      direction: 'outbound',
      senderType: 'system',
      content,
      messageType: 'tool_result',
      externalStatus: 'sent',
      timestamp: new Date(),
      metadata: {
        type: 'tool_result',
        hiddenFromInbox: true,
        toolName: toolCallName,
        status,
      },
    });
  }

  /**
   * Registra uma nova mensagem no banco de dados com defaults seguros.
   */
  async addMessage(dto: CreateMessageDto) {
    // 1. Determinar se é uma mensagem interna de tool call ou tool result
    const isToolCall =
      dto.messageType === 'tool_call' ||
      (dto.metadata &&
        typeof dto.metadata === 'object' &&
        (dto.metadata as Record<string, unknown>).type === 'tool_call');

    const isToolResult =
      dto.messageType === 'tool_result' ||
      (dto.metadata &&
        typeof dto.metadata === 'object' &&
        (dto.metadata as Record<string, unknown>).type === 'tool_result');

    const direction = dto.direction ?? 'outbound';

    // Se for tool call ou result, o senderType deve obrigatoriamente ser 'system'
    let senderType: 'customer' | 'ai' | 'human' | 'system' = 'system';
    if (!isToolCall && !isToolResult) {
      senderType = dto.senderType ?? (direction === 'inbound' ? 'customer' : 'system');
    }

    // Prefere externalStatus explícito ou infere conforme direção
    const externalStatus: 'sent' | 'delivered' | 'read' | 'failed' =
      dto.externalStatus ?? (direction === 'inbound' ? 'delivered' : 'sent');

    const timestamp = dto.timestamp ?? new Date();
    const messageType = dto.messageType ?? (isToolCall ? 'tool_call' : isToolResult ? 'tool_result' : 'text');

    // 2. Construir objeto de criação do Prisma omitindo chaves com valores undefined
    const data: Prisma.ChatMessageCreateInput = {
      session: { connect: { id: dto.sessionId } },
      direction,
      senderType,
      content: dto.content ?? '',
      messageType,
      externalStatus,
      ...(timestamp ? { timestamp } : {}),
      ...(dto.externalId ? { externalId: dto.externalId } : {}),
      ...(dto.toolCalls ? { toolCalls: dto.toolCalls } : {}),
      ...(dto.metadata ? { metadata: dto.metadata } : {}),
    };

    const message = await this.prisma.chatMessage.create({ data });

    const session = await this.prisma.chatSession.update({
      where: { id: dto.sessionId },
      data: {
        lastMessageAt: timestamp,
        ...(direction === 'inbound' ? { lastCustomerMessageAt: timestamp } : {}),
        ...(direction === 'outbound' ? { lastAgentMessageAt: timestamp } : {}),
      },
      select: { tenantId: true },
    });

    if (session) {
      this.chatGateway.emitMessageCreated(session.tenantId, dto.sessionId, message);
    }

    this.logger.log(
      `[CHAT_INBOX] message_saved sessionId=${dto.sessionId} senderType=${message.senderType} direction=${message.direction}`,
    );

    return message;
  }

  /**
   * Atualiza o estado da conversa (ex: de browsing_menu para checkout).
   */
  async updateSessionState(sessionId: string, state: ChatState, cartData?: Prisma.InputJsonValue) {
    const session = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        state,
        ...(cartData !== undefined ? { cartData } : {}),
      },
    });

    // Emit WebSocket event for session update
    this.chatGateway.emitSessionUpdated(session.tenantId, session);

    return session;
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
    this.logger.log(`[CHAT_INBOX] handoff_activated sessionId=${sessionId} reason=${reason || 'default'}`);

    // Emit WebSocket event for session update
    this.chatGateway.emitSessionUpdated(session.tenantId, session);

    // Log system message
    await this.addMessage({
      sessionId,
      direction: 'outbound',
      senderType: 'system',
      content: reason ? `Atendimento transferido para humano: ${reason}` : 'Atendimento transferido para humano',
      messageType: 'system',
      externalStatus: 'sent',
      timestamp: new Date(),
    });

    return session;
  }

  async deactivateHandoff(sessionId: string) {
    const session = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        handoffActive: false,
        handoffOperator: null,
        handoffReason: null,
        state: 'greeting',
      },
    });
    this.logger.log(`[CHAT_INBOX] handoff_deactivated sessionId=${sessionId}`);

    // Emit WebSocket event for session update
    this.chatGateway.emitSessionUpdated(session.tenantId, session);

    // Log system message
    await this.addMessage({
      sessionId,
      direction: 'outbound',
      senderType: 'system',
      content: 'Atendimento retornado para a Inteligência Artificial',
      messageType: 'system',
      externalStatus: 'sent',
      timestamp: new Date(),
    });

    return session;
  }

  /**
   * Remove o contexto temporário de IA que não deve ser preservado entre sessões.
   */
  async clearSessionTemporaryAiMemory(sessionId: string): Promise<void> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });

    const metadata = this.asJsonObject<Record<string, unknown>>(session?.metadata);
    const ai = this.asJsonObject<MetadataAi>(metadata.ai);
    const nextAi = { ...ai } as Record<string, unknown>;

    delete nextAi.lastAiProcessedAt;
    delete nextAi.lastProcessedMessageId;
    delete nextAi.pendingCustomerMessageIds;
    delete nextAi.currentIntent;
    delete nextAi.orderDraft;
    delete nextAi.toolFailures;

    metadata.ai = nextAi;

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { metadata: metadata as Prisma.InputJsonObject },
    });
  }

  async expireSession(sessionId: string, reason: string = 'timeout') {
    await this.clearSessionTemporaryAiMemory(sessionId);

    const session = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        state: 'expired',
        closedAt: new Date(),
        closeReason: reason,
        handoffActive: false,
      },
    });

    this.logger.log(`[CHAT_INBOX] session_expired sessionId=${sessionId} reason=${reason}`);
    this.chatGateway.emitSessionUpdated(session.tenantId, session);

    await this.addMessage({
      sessionId,
      direction: 'outbound',
      senderType: 'system',
      content: 'Sessão expirada por inatividade. Envie uma nova mensagem para iniciar um novo atendimento.',
      messageType: 'system',
      externalStatus: 'sent',
      metadata: {
        type: 'system',
        hiddenFromInbox: true,
      },
      timestamp: new Date(),
    });

    return session;
  }

  /**
   * Encerra a sessão totalmente.
   */
  async closeSession(sessionId: string, reason?: string) {
    await this.clearSessionTemporaryAiMemory(sessionId);

    const session = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        state: 'closed',
        closedAt: new Date(),
        closeReason: reason ?? 'manual',
        handoffActive: false,
      },
    });
    this.logger.log(`[CHAT_INBOX] session_closed sessionId=${sessionId} reason=${reason ?? 'manual'}`);

    // Emit WebSocket event for session update
    this.chatGateway.emitSessionUpdated(session.tenantId, session);

    // Log system message
    await this.addMessage({
      sessionId,
      direction: 'outbound',
      senderType: 'system',
      content: 'Conversa encerrada',
      messageType: 'system',
      externalStatus: 'sent',
      metadata: {
        type: 'system',
        hiddenFromInbox: true,
      },
      timestamp: new Date(),
    });

    return session;
  }

  private asJsonObject<T = Record<string, unknown>>(value: unknown): T {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as T;
    }
    return {} as T;
  }

  async recordAiToolFailure(input: {
    sessionId: string;
    toolName: string;
    signatureHash: string;
    errorCode: string;
  }): Promise<AiToolFailureEntry> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: input.sessionId },
      select: { metadata: true },
    });

    const metadata = this.asJsonObject<Record<string, unknown>>(session?.metadata);
    const ai = this.asJsonObject<MetadataAi>(metadata.ai);
    const toolFailures = this.asJsonObject<MetadataToolFailures>(ai.toolFailures);
    const existing = this.asJsonObject<MetadataToolFailureEntry>(toolFailures[input.toolName]);

    const count = typeof existing.count === 'number' ? existing.count : 0;
    const updated: AiToolFailureEntry = {
      count: count + 1,
      lastAt: new Date().toISOString(),
      lastSignatureHash: input.signatureHash,
      lastErrorCode: input.errorCode,
    };

    toolFailures[input.toolName] = updated;
    ai.toolFailures = toolFailures;
    metadata.ai = ai;

    await this.prisma.chatSession.update({
      where: { id: input.sessionId },
      data: { metadata: metadata as Prisma.InputJsonObject },
    });

    return updated;
  }

  async clearAiToolFailures(sessionId: string, toolName: string): Promise<void> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });

    const metadata = this.asJsonObject<Record<string, unknown>>(session?.metadata);
    const ai = this.asJsonObject<MetadataAi>(metadata.ai);
    const toolFailures = this.asJsonObject<MetadataToolFailures>(ai.toolFailures);

    if (toolFailures[toolName]) {
      delete toolFailures[toolName];
      ai.toolFailures = toolFailures;
      metadata.ai = ai;

      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { metadata: metadata as Prisma.InputJsonObject },
      });
    }
  }

  async clearAllAiToolFailures(sessionId: string): Promise<void> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });

    const metadata = this.asJsonObject<Record<string, unknown>>(session?.metadata);
    const ai = this.asJsonObject<MetadataAi>(metadata.ai);

    if (ai.toolFailures) {
      delete ai.toolFailures;
      metadata.ai = ai;
      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { metadata: metadata as Prisma.InputJsonObject },
      });
    }
  }

  async getAiToolFailures(sessionId: string): Promise<AiToolFailuresMap> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });

    const metadata = this.asJsonObject<Record<string, unknown>>(session?.metadata);
    const ai = this.asJsonObject<MetadataAi>(metadata.ai);
    const toolFailures = this.asJsonObject<MetadataToolFailures>(ai.toolFailures);

    const out: AiToolFailuresMap = {};
    for (const key of Object.keys(toolFailures)) {
      const entry = this.asJsonObject<MetadataToolFailureEntry>(toolFailures[key]);
      const count = typeof entry.count === 'number' ? entry.count : null;
      const lastAt = typeof entry.lastAt === 'string' ? entry.lastAt : null;
      if (count === null || lastAt === null) continue;

      out[key] = {
        count,
        lastAt,
        lastSignatureHash: typeof entry.lastSignatureHash === 'string' ? entry.lastSignatureHash : undefined,
        lastErrorCode: typeof entry.lastErrorCode === 'string' ? entry.lastErrorCode : undefined,
      };
    }

    return out;
  }

  async shouldBlockAiToolCall(input: {
    sessionId: string;
    toolName: string;
    signatureHash: string;
    maxFailures: number;
    windowMs: number;
  }): Promise<boolean> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: input.sessionId },
      select: { metadata: true },
    });

    const metadata = this.asJsonObject<Record<string, unknown>>(session?.metadata);
    const ai = this.asJsonObject<MetadataAi>(metadata.ai);
    const toolFailures = this.asJsonObject<MetadataToolFailures>(ai.toolFailures);
    const entry = this.asJsonObject<MetadataToolFailureEntry>(toolFailures[input.toolName]);

    const count = typeof entry.count === 'number' ? entry.count : 0;
    const lastAt = typeof entry.lastAt === 'string' ? entry.lastAt : null;
    const lastSignatureHash = typeof entry.lastSignatureHash === 'string' ? entry.lastSignatureHash : null;

    if (!lastAt || !lastSignatureHash) {
      return false;
    }

    const lastAtMs = Date.parse(lastAt);
    if (!Number.isFinite(lastAtMs)) {
      return false;
    }

    const withinWindow = Date.now() - lastAtMs <= input.windowMs;
    const sameSignature = lastSignatureHash === input.signatureHash;
    return withinWindow && sameSignature && count >= input.maxFailures;
  }

  /**
   * Encerra sessão porque o cliente usou comando de saída (ex: #Sair).
   * Preserva memória persistente, limpa temporária, envia mensagem de confirmação.
   */
  async closeSessionByCustomerExit(sessionId: string, exitCommand: string): Promise<{ session: ChatSession; message: ChatMessage }> {
    const now = new Date();

    // Limpa contexto temporário
    await this.clearSessionTemporaryAiMemory(sessionId);

    // Marca sessão como fechada
    const session = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        state: 'closed',
        closedAt: now,
        closeReason: 'customer_exit',
        handoffActive: false,
      },
    });

    this.logger.log(
      `[AI_SESSION] exit_command_received sessionId=${sessionId} command="${exitCommand}" closeReason=customer_exit`,
    );
    this.chatGateway.emitSessionUpdated(session.tenantId, session);

    // Registra o comando do cliente como mensagem
    const customerMessage = await this.addMessage({
      sessionId,
      direction: 'inbound',
      senderType: 'customer',
      content: exitCommand,
      messageType: 'text',
      externalStatus: 'delivered',
      timestamp: now,
    });

    // Envia mensagem de confirmação
    const responseMessage = await this.addMessage({
      sessionId,
      direction: 'outbound',
      senderType: 'system',
      content: 'Atendimento encerrado conforme solicitado. Quando quiser, é só mandar uma nova mensagem 😊',
      messageType: 'text',
      externalStatus: 'sent',
      timestamp: new Date(now.getTime() + 100), // Slight delay para ordem
      metadata: {
        type: 'system',
        isConfirmation: true,
      },
    });

    this.logger.log(
      `[AI_SESSION] session_closed_by_customer sessionId=${sessionId} customerId=${session.customerId}`,
    );

    return { session, message: responseMessage };
  }
}
