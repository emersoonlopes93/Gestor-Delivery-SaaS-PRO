import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChatState, MessageDirection, ChatSession, ChatMessage } from '@prisma/client';

import { Prisma } from '@prisma/client';
import type { AgentSessionContext } from './agent-tools.service';
import { ChatGateway } from '../../chat/chat.gateway';
import { validateOrderDraft } from '../utils/order-draft-validator.util';

export interface AiOrderDraft {
  items: Array<{
    productId: string | null;
    quantity: number;
    notes?: string | null;
    /** Nome legível do produto (ex: Pizza de Calabresa) */
    name?: string | null;
    /** Alias legado mantido por compatibilidade */
    productName?: string | null;
    /** Preço unitário real do produto */
    unitPrice?: number | null;
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
    /** true = cliente confirmou que não precisa de troco */
    changeConfirmed?: boolean | null;
  };
  deliveryFee: number | null;
  subtotal: number | null;
  total: number | null;
  missingFields: string[];
  readyToConfirm: boolean;
  confirmationAskedAt: string | null;
  /** Data/hora ISO para pedido agendado (loja fechada) */
  scheduledFor: string | null;
  /** true = cliente confirmou explicitamente não precisa troco */
  changeConfirmed?: boolean | null;
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
  scheduledFor?: unknown;
  changeConfirmed?: unknown;
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
  changeConfirmed?: unknown;
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


export interface AiOrderDraft {
  items: Array<{
    productId: string | null;
    quantity: number;
    notes?: string | null;
    /** Nome legível do produto (ex: Pizza de Calabresa) */
    name?: string | null;
    /** Alias legado mantido por compatibilidade */
    productName?: string | null;
    /** Preço unitário real do produto */
    unitPrice?: number | null;
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
    /** true = cliente confirmou que não precisa de troco */
    changeConfirmed?: boolean | null;
  };
  deliveryFee: number | null;
  subtotal: number | null;
  total: number | null;
  missingFields: string[];
  readyToConfirm: boolean;
  confirmationAskedAt: string | null;
  /** Data/hora ISO para pedido agendado (loja fechada) */
  scheduledFor: string | null;
  /** true = cliente confirmou explicitamente não precisa troco */
  changeConfirmed?: boolean | null;
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
  scheduledFor?: unknown;
  changeConfirmed?: unknown;
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
  changeConfirmed?: unknown;
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
              productId: string | null;
              quantity: number;
              notes?: string | null;
              productName?: string | null;
              name?: string | null;
              unitPrice?: number | null;
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
        scheduledFor: typeof draft.scheduledFor === 'string' ? draft.scheduledFor : null,
        changeConfirmed: draft.changeConfirmed === true ? true : null,
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

    // Merge profundo para orderDraft: evita substituição rasa que perde campos
    if (update.orderDraft !== undefined) {
      const existingDraft = this.asJsonObject<MetadataOrderDraft>(ai.orderDraft);
      const incomingDraft = this.asJsonObject<MetadataOrderDraft>(update.orderDraft);

      // Merge profundo de deliveryAddress
      const existingAddr = this.asJsonObject<MetadataDeliveryAddress>(existingDraft.deliveryAddress);
      const incomingAddr = this.asJsonObject<MetadataDeliveryAddress>(incomingDraft.deliveryAddress ?? {});
      const mergedAddr = { ...existingAddr, ...incomingAddr };

      // Merge profundo de payment
      const existingPayment = this.asJsonObject<MetadataPayment>(existingDraft.payment);
      const incomingPayment = this.asJsonObject<MetadataPayment>(incomingDraft.payment ?? {});
      const mergedPayment = { ...existingPayment, ...incomingPayment };

      // items: se a propriedade items veio no incomingDraft (mesmo vazia, indicando limpeza explícita ou substituição total), usa ela. Caso contrário, mantém os existentes.
      const mergedItems = 'items' in incomingDraft
        ? (Array.isArray(incomingDraft.items) ? incomingDraft.items : [])
        : (existingDraft.items ?? []);

      const mergedDraft: MetadataOrderDraft = {
        ...existingDraft,
        ...incomingDraft,
        items: mergedItems,
        deliveryAddress: mergedAddr,
        payment: mergedPayment,
      };

      const nextAi = { ...ai, ...update, orderDraft: mergedDraft } as Record<string, unknown>;
      metadata.ai = nextAi;
    } else {
      const nextAi = { ...ai, ...update } as Record<string, unknown>;
      metadata.ai = nextAi;
    }

    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { metadata: metadata as Prisma.InputJsonObject },
    });
  }

  /**
   * Atualiza apenas campos específicos do orderDraft com merge profundo.
   * Use este método nas tools de coleta de pedido.
   */
  async updateOrderDraft(sessionId: string, partialDraft: Partial<AiOrderDraft>): Promise<void> {
    const current = await this.getSessionAiMemory(sessionId);
    const existing = current.orderDraft;

    const mergedItems = 'items' in partialDraft && partialDraft.items
      ? partialDraft.items
      : existing.items;

    const mergedAddress = {
      ...existing.deliveryAddress,
      ...(partialDraft.deliveryAddress ?? {}),
    };

    const mergedPayment = {
      ...existing.payment,
      ...(partialDraft.payment ?? {}),
    };

    const draftBeforeValidation: AiOrderDraft = {
      ...existing,
      ...partialDraft,
      items: mergedItems,
      deliveryAddress: mergedAddress as AiOrderDraft['deliveryAddress'],
      payment: mergedPayment as AiOrderDraft['payment'],
    };

    const missingFields = validateOrderDraft(draftBeforeValidation);
    const readyToConfirm = missingFields.length === 0 && draftBeforeValidation.items.length > 0;
    const mergedDraft: AiOrderDraft = {
      ...draftBeforeValidation,
      missingFields,
      readyToConfirm,
    };

    await this.updateSessionAiMemory(sessionId, { orderDraft: mergedDraft });
    this.logger.log(
      `[AI_DRAFT] missing_fields fields=[${missingFields.join(',')}] ready=${readyToConfirm} sessionId=${sessionId}`,
    );
    if (readyToConfirm) {
      this.logger.log(`[AI_DRAFT] ready_to_confirm true sessionId=${sessionId}`);
    }
  }

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
   * Obtém a configuração de se deve limpar o rascunho de pedido ao expirar/fechar a sessão
   */
  async getResetDraftSetting(sessionId: string): Promise<boolean> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });

    if (!session) {
      return true;
    }

    const config = await this.prisma.aiAgentConfig.findUnique({
      where: { tenantId: session.tenantId },
    });

    if (!config || config.useGlobalDefaults) {
      const globalConfig = await this.prisma.systemConfig.findFirst();
      return globalConfig?.aiResetDraftOnSessionClose ?? true;
    }

    return config.resetDraftOnSessionClose;
  }

  /**
   * Remove o contexto temporário de IA que não deve ser preservado entre sessões.
   */
  async clearSessionTemporaryAiMemory(sessionId: string, resetDraftOnSessionClose: boolean = true): Promise<void> {
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
    if (resetDraftOnSessionClose) {
      delete nextAi.orderDraft;
    }
    delete nextAi.toolFailures;

    metadata.ai = nextAi;

    await this.prisma.chatSession.update({
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

    const resetDraft = await this.getResetDraftSetting(sessionId);
    // Limpa contexto temporário
    await this.clearSessionTemporaryAiMemory(sessionId, resetDraft);

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
    if (ChatGateway.instance) {
      ChatGateway.instance.emitSessionUpdated(session.tenantId, session);
    }

    // Registra o comando do cliente como mensagem
    await this.addMessage({
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
