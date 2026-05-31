import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { AiAgentConfigService, type EffectiveAiAgentConfig } from './ai-agent-config.service';
import { ConversationService } from './conversation.service';
import { AgentToolsService } from './agent-tools.service';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';
import { AiProviderRegistryService } from './ai-provider-registry.service';
import { AdminModulesService } from '../../admin/modules/admin-modules.service';
import type { AiMessage } from '../interfaces/ai-provider.interface';
import { AiFlowLogger, createAiTrace, type AiFlowContext } from '../../common/logging/ai-flow-logger';
import { shouldSimulateTyping } from '../utils/simulate-typing.util';
import { getTypingDelayMs } from '../../common/utils/whatsapp-presence.util';
import {
  DEFAULT_GLOBAL_BASE_AI_PROMPT,
  buildToolsManifestForPrompt,
} from '../constants/global-base-prompt';
import type { AgentSessionContext } from './agent-tools.service';
import { AvailabilityService } from '../../catalog/publication/availability.service';
import {
  buildStoreStatusPromptBlock,
  resolveStoreOperationalStatus,
} from '../utils/store-status-context.util';
import { buildOrderDraftPromptBlock } from '../utils/order-draft-validator.util';

import { PrismaService } from '../../database/prisma.service';

import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';

interface ProcessMessageOptions {
  trace: AiFlowContext;
  dryRun?: boolean;
}

export interface AiDebugTestResult {
  success: boolean;
  dryRun: boolean;
  traceId: string;
  steps: string[];
  error?: string;
  responsePreview?: string;
}

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger('AiOrchestratorService');
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  /** Momento em que composing foi enviado (para delay mínimo visível no WhatsApp) */
  private readonly typingStartedAt = new Map<string, number>();
  /** Sessions currently being processed to avoid parallel runs */
  private readonly processingSessions = new Set<string>();
  /** Keys que precisam de nova rodada após o processamento atual terminar */
  private readonly pendingReruns = new Set<string>();

  constructor(
    private readonly configService: AiAgentConfigService,
    private readonly conversationService: ConversationService,
    private readonly toolsService: AgentToolsService,
    @Inject(forwardRef(() => WhatsAppSenderService))
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly aiRegistry: AiProviderRegistryService,
    private readonly prisma: PrismaService,
    private readonly adminModulesService: AdminModulesService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  private async applyDeterministicDraftCapture(sessionId: string, content: string): Promise<void> {
    const text = content.trim();
    if (!text) return;

    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const memory = await this.conversationService.getSessionAiMemory(sessionId);
    const draft = memory.orderDraft;

    if (/^(delivery|entrega|entregar|entregue)$/i.test(normalized)) {
      await this.conversationService.updateOrderDraft(sessionId, { fulfillmentType: 'delivery' });
      this.logger.log(`[AI_DRAFT] fulfillment_set delivery sessionId=${sessionId}`);
      return;
    }

    if (/^(retirada|retirar|pickup|balcao|balcão)$/i.test(normalized)) {
      await this.conversationService.updateOrderDraft(sessionId, { fulfillmentType: 'pickup' });
      this.logger.log(`[AI_DRAFT] fulfillment_set pickup sessionId=${sessionId}`);
      return;
    }

    if (/^(dinheiro|cash)$/i.test(normalized)) {
      await this.conversationService.updateOrderDraft(sessionId, {
        payment: { method: 'cash', changeFor: null, changeConfirmed: null },
      });
      this.logger.log(`[AI_DRAFT] payment_set cash sessionId=${sessionId}`);
      return;
    }

    const cashChange = normalized.match(/^(\d{1,4})(?:[,.](\d{1,2}))?$/);
    if (cashChange && draft.payment.method === 'cash' && draft.payment.changeFor === null) {
      const amount = Number(`${cashChange[1]}.${cashChange[2] ?? '0'}`);
      await this.conversationService.updateOrderDraft(sessionId, {
        payment: { method: 'cash', changeFor: amount, changeConfirmed: null },
      });
      this.logger.log(`[AI_DRAFT] change_for_set ${amount} sessionId=${sessionId}`);
      return;
    }

    const addressMatch = text.match(/^(.+?),\s*(\d{1,6}[A-Za-z]?)$/);
    if (addressMatch) {
      await this.conversationService.updateOrderDraft(sessionId, {
        fulfillmentType: 'delivery',
        deliveryAddress: {
          ...draft.deliveryAddress,
          street: addressMatch[1].trim(),
          number: addressMatch[2].trim(),
        },
      });
      this.logger.log(`[AI_DRAFT] address_updated sessionId=${sessionId}`);
      return;
    }

    const shortPlace = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{2,60}$/.test(text);
    const isConfirmation = /^(sim|isso|pode ser|ok|correto|confirmo)$/i.test(normalized);
    if (draft.fulfillmentType === 'delivery' && shortPlace && !isConfirmation) {
      if (draft.deliveryAddress.street && draft.deliveryAddress.number && !draft.deliveryAddress.neighborhood) {
        await this.conversationService.updateOrderDraft(sessionId, {
          deliveryAddress: { ...draft.deliveryAddress, neighborhood: text },
        });
        this.logger.log(`[AI_DRAFT] address_updated sessionId=${sessionId}`);
        return;
      }

      if (draft.deliveryAddress.street && draft.deliveryAddress.neighborhood && !draft.deliveryAddress.city) {
        await this.conversationService.updateOrderDraft(sessionId, {
          deliveryAddress: { ...draft.deliveryAddress, city: text },
        });
        this.logger.log(`[AI_DRAFT] address_updated sessionId=${sessionId}`);
      }
    }
  }

  private async executeDeterministicTool(
    tenantId: string,
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>,
    agentSessionCtx: AgentSessionContext,
  ): Promise<unknown> {
    const toolCall = {
      id: `det_${toolName}_${Date.now()}`,
      name: toolName,
      arguments: args,
    };
    await this.conversationService.createInternalToolCallMessage(sessionId, [toolCall as Prisma.InputJsonObject]);
    const result = await this.toolsService.executeTool(tenantId, toolName, args, agentSessionCtx);
    await this.conversationService.createInternalToolResultMessage(
      sessionId,
      JSON.stringify(result),
      toolName,
      this.getToolResultStatus(result),
    );
    return result;
  }

  private async applyDeterministicToolCapture(
    tenantId: string,
    sessionId: string,
    content: string,
    agentSessionCtx: AgentSessionContext,
  ): Promise<void> {
    const text = content.trim();
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const memory = await this.conversationService.getSessionAiMemory(sessionId);
    const draft = memory.orderDraft;

    const isConfirmation = /^(sim|isso|pode ser|ok|correto|confirmo)$/i.test(normalized);
    if (isConfirmation && draft.readyToConfirm) {
      this.logger.log(`[AI_ORDER] confirmation_requested sessionId=${sessionId}`);
      const result = await this.executeDeterministicTool(
        tenantId,
        sessionId,
        'criar_pedido',
        {
          itens: draft.items.map((item) => ({
            productId: item.productId ?? undefined,
            quantity: item.quantity,
            notes: item.notes ?? undefined,
          })),
          fulfillmentType: draft.fulfillmentType ?? 'delivery',
          endereco: draft.fulfillmentType === 'delivery'
            ? {
                street: draft.deliveryAddress.street,
                number: draft.deliveryAddress.number,
                neighborhood: draft.deliveryAddress.neighborhood,
                city: draft.deliveryAddress.city,
                state: draft.deliveryAddress.state ?? 'SP',
                zipCode: draft.deliveryAddress.zipCode ?? undefined,
                complement: draft.deliveryAddress.complement ?? undefined,
              }
            : undefined,
          formaPagamento: draft.payment.method ?? 'cash',
          troco: draft.payment.method === 'cash' ? draft.payment.changeFor ?? undefined : undefined,
          scheduledFor: draft.scheduledFor ?? undefined,
        },
        agentSessionCtx,
      );
      const orderId = this.getOrderIdFromToolResult(result);
      if (this.getToolResultStatus(result) === 'success' && orderId) {
        await this.conversationService.clearOrderDraft(sessionId);
        this.logger.log(`[AI_ORDER] create_order_success orderId=${orderId} sessionId=${sessionId}`);
      }
      return;
    }

    const itemMatch = normalized.match(/\b(?:quero|queria|vou querer|pedido)\s+(\d+)\s+(?:x\s+)?(?:pizza|pizzas?)\s+(?:de\s+)?calabresa\b/);
    if (itemMatch && draft.items.length === 0) {
      await this.executeDeterministicTool(
        tenantId,
        sessionId,
        'adicionar_item_pedido',
        { nomeOuBusca: 'Pizza de Calabresa', quantidade: Number(itemMatch[1]) },
        agentSessionCtx,
      );
      return;
    }

    if (/^(delivery|entrega|entregar|entregue)$/i.test(normalized)) {
      await this.executeDeterministicTool(tenantId, sessionId, 'definir_entrega_retirada', { tipo: 'delivery' }, agentSessionCtx);
      return;
    }

    if (/^(dinheiro|cash)$/i.test(normalized)) {
      await this.executeDeterministicTool(tenantId, sessionId, 'definir_forma_pagamento', { metodo: 'cash' }, agentSessionCtx);
      return;
    }

    const cashChange = normalized.match(/^(\d{1,4})(?:[,.](\d{1,2}))?$/);
    if (cashChange && draft.payment.method === 'cash') {
      const amount = Number(`${cashChange[1]}.${cashChange[2] ?? '0'}`);
      await this.executeDeterministicTool(tenantId, sessionId, 'definir_forma_pagamento', { metodo: 'cash', troco: amount }, agentSessionCtx);
      return;
    }

    const addressMatch = text.match(/^(.+?),\s*(\d{1,6}[A-Za-z]?)$/);
    if (addressMatch) {
      await this.executeDeterministicTool(
        tenantId,
        sessionId,
        'definir_endereco_entrega',
        { rua: addressMatch[1].trim(), numero: addressMatch[2].trim() },
        agentSessionCtx,
      );
      return;
    }

    const shortPlace = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{2,60}$/.test(text);
    if (draft.fulfillmentType === 'delivery' && shortPlace && !isConfirmation) {
      if (draft.deliveryAddress.street && draft.deliveryAddress.number && !draft.deliveryAddress.neighborhood) {
        await this.executeDeterministicTool(tenantId, sessionId, 'definir_endereco_entrega', { bairro: text }, agentSessionCtx);
        return;
      }
      if (
        draft.deliveryAddress.street &&
        draft.deliveryAddress.neighborhood &&
        draft.deliveryAddress.neighborhood !== text &&
        draft.deliveryAddress.city !== text
      ) {
        await this.executeDeterministicTool(tenantId, sessionId, 'definir_endereco_entrega', { cidade: text }, agentSessionCtx);
      }
    }
  }

  /**
   * Ponto de entrada principal para mensagens inbound do WhatsApp.
   */
  async handleInboundMessage(
    tenantId: string,
    sessionId: string,
    customerPhone: string,
    content: string,
    trace?: AiFlowContext,
    chatJid?: string,
  ): Promise<void> {
    const flowTrace = trace ?? createAiTrace();
    flowTrace.tenantId = tenantId;
    flowTrace.sessionId = sessionId;
    flowTrace.phone = customerPhone;
    if (chatJid) flowTrace.chatJid = chatJid;

    AiFlowLogger.flow('orchestrator_inbound_start', flowTrace, {
      textLength: content.length,
    });

    const hasModuleAccess = await this.adminModulesService.hasModuleAccess(
      tenantId,
      'ai_agent',
    );
    if (!hasModuleAccess) {
      AiFlowLogger.ignored('ai_module_disabled', flowTrace);
      return;
    }

    const config = await this.configService.getEffectiveAiAgentConfig(tenantId);
    this.logger.log(`[AI_MEMORY] config_loaded tenantId=${tenantId} memoryEnabled=${config.memoryEnabled}`);
    const systemConfig = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: { defaultAiProvider: true, googleAiModel: true },
    });
    const providerType = systemConfig?.defaultAiProvider ?? 'openai';

    const resolvedModel =
      providerType === 'google_ai'
        ? systemConfig?.googleAiModel ?? 'gemini-2.0-flash-lite'
        : providerType === 'anthropic'
          ? process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20240620'
          : process.env.OPENAI_MODEL ?? 'gpt-4o';

    const modelSource =
      providerType === 'google_ai'
        ? systemConfig?.googleAiModel
          ? 'system_config'
          : 'default'
        : providerType === 'anthropic'
          ? process.env.ANTHROPIC_MODEL
            ? 'env'
            : 'default'
          : process.env.OPENAI_MODEL
            ? 'env'
            : 'default';

    AiFlowLogger.flow('ai_config_loaded', flowTrace, {
      tenantId,
      agentName: config.agentName,
      isEnabled: config.isEnabled,
      provider: providerType,
      providerSource: 'system_config',
      model: resolvedModel,
      modelSource,
      debounceMs: config.debounceMs ?? 1000,
      operatingMode: config.operatingMode,
      handoffActive: false,
      configSource: config._resolution.source,
    });

    if (!config.isEnabled) {
      AiFlowLogger.ignored('ai_disabled_for_tenant', flowTrace);
      return;
    }

    const debounceKey = `${tenantId}:${sessionId}`;

    if (this.debounceTimers.has(debounceKey)) {
      AiFlowLogger.flow('AI_DEBOUNCE timer_cancelled', flowTrace, { sessionId, tenantId });
      this.logger.log(`[AI_DEBOUNCE] timer_cancelled sessionId=${sessionId}`);
      clearTimeout(this.debounceTimers.get(debounceKey));
    }

    const debounceMs = config.debounceMs ?? 10000;
    AiFlowLogger.flow('AI_DEBOUNCE timer_scheduled', flowTrace, { sessionId, tenantId, delayMs: debounceMs });
    this.logger.log(`[AI_DEBOUNCE] timer_scheduled sessionId=${sessionId} delayMs=${debounceMs}`);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
      AiFlowLogger.flow('AI_DEBOUNCE timer_fired', flowTrace, { sessionId, tenantId });
      this.logger.log(`[AI_DEBOUNCE] timer_fired sessionId=${sessionId}`);

      if (this.processingSessions.has(debounceKey)) {
        AiFlowLogger.flow('AI_DEBOUNCE skipped_already_processing', flowTrace, { sessionId, tenantId });
        this.logger.log(`[AI_DEBOUNCE] skipped_already_processing sessionId=${sessionId}`);
        this.pendingReruns.add(debounceKey);
        AiFlowLogger.flow('AI_DEBOUNCE rerun_scheduled', flowTrace, { sessionId, tenantId });
        this.logger.log(`[AI_DEBOUNCE] rerun_scheduled sessionId=${sessionId}`);
        return;
      }

      this.processingSessions.add(debounceKey);
      (async () => {
        try {
          await this.processPendingSessionMessages(
            tenantId,
            sessionId,
            customerPhone,
            config,
            {
              trace: flowTrace,
            },
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          AiFlowLogger.error('process_message', flowTrace, { error: msg });
          this.logger.error(`Error processing message for ${customerPhone}: ${msg}`);
        } finally {
          this.processingSessions.delete(debounceKey);

          if (this.pendingReruns.has(debounceKey)) {
            this.pendingReruns.delete(debounceKey);
            AiFlowLogger.flow('AI_DEBOUNCE rerun_triggered', flowTrace, { sessionId, tenantId });
            this.logger.log(`[AI_DEBOUNCE] rerun_triggered sessionId=${sessionId}`);
            const rerunTimer = setTimeout(() => {
              this.debounceTimers.delete(debounceKey);
              AiFlowLogger.flow('AI_DEBOUNCE timer_fired', flowTrace, { sessionId, tenantId });
              this.logger.log(`[AI_DEBOUNCE] timer_fired sessionId=${sessionId}`);

              if (this.processingSessions.has(debounceKey)) {
                this.pendingReruns.add(debounceKey);
                AiFlowLogger.flow('AI_DEBOUNCE rerun_scheduled', flowTrace, { sessionId, tenantId });
                this.logger.log(`[AI_DEBOUNCE] rerun_scheduled sessionId=${sessionId}`);
                return;
              }

              this.processingSessions.add(debounceKey);
              (async () => {
                try {
                  this.logger.log(`[AI_DEBOUNCE] rerun_processing sessionId=${sessionId}`);
                  await this.processPendingSessionMessages(
                    tenantId,
                    sessionId,
                    customerPhone,
                    config,
                    { trace: flowTrace },
                  );
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Unknown error';
                  AiFlowLogger.error('process_message', flowTrace, { error: msg });
                  this.logger.error(`Error processing message for ${customerPhone}: ${msg}`);
                } finally {
                  this.processingSessions.delete(debounceKey);
                }
              })();
            }, 50);

            this.debounceTimers.set(debounceKey, rerunTimer);
          }
        }
      })();
    }, debounceMs);

    this.debounceTimers.set(debounceKey, timer);
  }

  private async processPendingSessionMessages(
    tenantId: string,
    sessionId: string,
    customerPhone: string,
    config: EffectiveAiAgentConfig,
    options: ProcessMessageOptions,
  ) {
    const { trace } = options;
    const session = await this.conversationService.getSessionById(sessionId);
    if (!session) {
      AiFlowLogger.error('AI_DEBOUNCE session_not_found', trace, {
        sessionId,
        tenantId,
      });
      this.logger.error(`[AI_DEBOUNCE] session_not_found sessionId=${sessionId}`);
      return;
    }

    const aiMemory = await this.conversationService.getSessionAiMemory(sessionId);
    const lastProcessedAt = aiMemory.lastAiProcessedAt
      ? new Date(aiMemory.lastAiProcessedAt)
      : undefined;

    const pendingMessages = await this.prisma.chatMessage.findMany({
      where: {
        sessionId,
        direction: 'inbound',
        messageType: 'text',
        ...(lastProcessedAt
          ? {
              createdAt: {
                gt: lastProcessedAt,
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    if (pendingMessages.length === 0) {
      AiFlowLogger.flow('AI_DEBOUNCE no_new_messages', trace, {
        sessionId,
        tenantId,
      });
      this.logger.log(`[AI_DEBOUNCE] no_new_messages sessionId=${sessionId}`);
      return;
    }

    const messageIds = pendingMessages.map((message) => message.id);
    await this.conversationService.updateSessionAiMemory(sessionId, {
      pendingCustomerMessageIds: messageIds,
    });

    AiFlowLogger.flow('AI_DEBOUNCE batch_started', trace, {
      sessionId,
      tenantId,
      messageCount: pendingMessages.length,
    });
    this.logger.log(`[AI_DEBOUNCE] batch_started sessionId=${sessionId} messageCount=${pendingMessages.length}`);

    await this.processMessage(
      tenantId,
      sessionId,
      customerPhone,
      pendingMessages.map((m) => m.content).join('\n'),
      config,
      options,
    );

    await this.conversationService.updateSessionAiMemory(sessionId, {
      lastAiProcessedAt: new Date().toISOString(),
      lastProcessedMessageId: messageIds[messageIds.length - 1],
      pendingCustomerMessageIds: [],
    });

    AiFlowLogger.flow('AI_DEBOUNCE batch_completed', trace, {
      sessionId,
      tenantId,
      messageCount: pendingMessages.length,
    });
    this.logger.log(`[AI_DEBOUNCE] batch_completed sessionId=${sessionId} messageCount=${pendingMessages.length}`);
  }

  private buildSessionMemoryPrompt(
    aiMemory: Awaited<ReturnType<ConversationService['getSessionAiMemory']>>,
    config: EffectiveAiAgentConfig,
  ): string | null {
    const memoryLines: string[] = [
      '## Memória persistente do cliente (entre sessões)',
    ];

    const isRecentName = this.isMemoryEntryFresh(
      aiMemory.lastKnownCustomerNameAt,
      config.memoryRetentionDays,
    );
    if (config.rememberCustomerName && aiMemory.lastKnownCustomerName && isRecentName) {
      memoryLines.push(`- Nome anterior do cliente: ${aiMemory.lastKnownCustomerName}`);
    }

    const isRecentAddress = this.isMemoryEntryFresh(
      aiMemory.lastKnownAddressAt,
      config.memoryRetentionDays,
    );
    if (config.rememberAddresses && aiMemory.lastKnownAddress.street && isRecentAddress) {
      const address = aiMemory.lastKnownAddress;
      const formatted = `${address.street}${address.number ? `, ${address.number}` : ''}${address.neighborhood ? ` - ${address.neighborhood}` : ''}${address.city ? `, ${address.city}` : ''}${address.state ? `/${address.state}` : ''}`;
      memoryLines.push(`- Último endereço conhecido: ${formatted}`);
    }

    if (
      config.rememberLastOrder &&
      aiMemory.lastOrderSummary &&
      this.isMemoryEntryFresh(aiMemory.lastOrderCreatedAt, config.memoryRetentionDays)
    ) {
      memoryLines.push(`- Último pedido salvo: ${aiMemory.lastOrderSummary}`);
    }

    // NOTA: não usar orderDraft como "preferências" aqui — o draft tem seu próprio bloco CURRENT_ORDER_DRAFT

    if (memoryLines.length <= 1) {
      return null;
    }

    memoryLines.push(
      '- Use apenas informações do tenant atual. Não compartilhe dados de outros clientes ou tenants. Se tiver dúvida, confirme com o cliente.',
    );
    return memoryLines.join('\n');
  }

  private isMemoryEntryFresh(entryAt: string | null, retentionDays?: number): boolean {
    if (!entryAt) return false;
    if (!retentionDays || retentionDays <= 0) return true;
    const entryDate = new Date(entryAt);
    if (Number.isNaN(entryDate.getTime())) return false;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return entryDate >= cutoff;
  }

  /**
   * Gera bloco de contexto de data/hora atual no timezone do tenant.
   * Injeta hoje, amanhã, dia da semana e hora local para evitar alucinações em agendamentos.
   */
  private buildDateTimeContextBlock(tenantId: string): string {
    // Usar timezone padrão Brasil como fallback enquanto não há campo no schema
    const timezone = 'America/Sao_Paulo';

    const now = new Date();

    const dtFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      weekday: 'long',
    });

    const todayIso = dateFormatter.format(now);
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowIso = dateFormatter.format(tomorrowDate);

    const weekdayToday = weekdayFormatter.format(now);
    const weekdayTomorrow = weekdayFormatter.format(tomorrowDate);

    // Formatar datetime atual como ISO com offset
    const dtParts = dtFormatter.formatToParts(now);
    const getPart = (type: string) => dtParts.find((p) => p.type === type)?.value ?? '';
    const currentDateTime = `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;

    const contextJson = JSON.stringify({
      currentDateTime,
      timezone,
      today: todayIso,
      tomorrow: tomorrowIso,
      weekdayToday,
      weekdayTomorrow,
    });

    this.logger.log(`[AI_TIME] context_injected tenantId=${tenantId} now=${currentDateTime} tz=${timezone}`);

    return [
      '## Contexto de data/hora atual (use para agendamentos — não calcule datas sozinho)',
      '```json',
      contextJson,
      '```',
      'REGRA: Nunca afirme uma data sem usar estes valores. Para agendamento, sempre use consultar_slots_agendamento com a data correta calculada daqui.',
    ].join('\n');
  }

  private extractCustomerNameFromText(text: string): string | null {
    const match = text.match(/\b(?:meu nome é|me chamo|sou)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ]+(?:\s+[A-ZÀ-Ÿ][A-Za-zÀ-ÿ]+){0,3})/i);
    return match ? match[1].trim() : null;
  }

  private extractSimpleAddressFromText(text: string): { street: string | null } | null {
    const match = text.match(/\b(?:meu endereço é|endereço é|endereco é|endereço:|endereco:)\s*([^\n\.\,]+)/i);
    if (!match) return null;
    return { street: match[1].trim() };
  }

  /**
   * Teste manual do orquestrador (admin), sem depender do webhook WhatsApp.
   */
  async debugTestInboundMessage(input: {
    tenantSlug: string;
    text: string;
    phone: string;
    dryRun?: boolean;
  }): Promise<AiDebugTestResult> {
    const trace = createAiTrace();
    const steps: string[] = [];
    const push = (s: string) => steps.push(s);

    push('debug_test_start');

    const tenant = await this.prisma.tenant.findFirst({
      where: { slug: input.tenantSlug },
      select: { id: true, slug: true, name: true },
    });

    if (!tenant) {
      AiFlowLogger.error('tenant_not_found', trace, { slug: input.tenantSlug });
      return {
        success: false,
        dryRun: input.dryRun ?? true,
        traceId: trace.traceId ?? '',
        steps,
        error: `Tenant não encontrado: ${input.tenantSlug}`,
      };
    }

    trace.tenantId = tenant.id;
    trace.phone = input.phone;
    push(`tenant_resolved slug=${tenant.slug}`);

    const hasModuleAccess = await this.adminModulesService.hasModuleAccess(
      tenant.id,
      'ai_agent',
    );
    if (!hasModuleAccess) {
      AiFlowLogger.ignored('ai_module_disabled', trace);
      return {
        success: false,
        dryRun: input.dryRun ?? true,
        traceId: trace.traceId ?? '',
        steps: [...steps, 'ignored:ai_module_disabled'],
        error: 'Módulo ai_agent desabilitado para o tenant',
      };
    }

    const config = await this.configService.getEffectiveAiAgentConfig(tenant.id);
    push(`ai_config enabled=${config.isEnabled}`);

    if (!config.isEnabled) {
      return {
        success: false,
        dryRun: input.dryRun ?? true,
        traceId: trace.traceId ?? '',
        steps: [...steps, 'ignored:ai_disabled_for_tenant'],
        error: 'Agente IA desativado (isEnabled=false). Ative em Configurações do tenant.',
      };
    }

    try {
      const session = await this.conversationService.getOrCreateSession(
        tenant.id,
        input.phone,
      );
      const result = await this.processMessage(
        tenant.id,
        session.id,
        input.phone,
        input.text,
        config,
        { trace, dryRun: input.dryRun ?? true },
      );
      push('process_message_completed');
      const preview =
        result && typeof result === 'object' && 'contentPreview' in result
          ? result.contentPreview
          : undefined;
      return {
        success: true,
        dryRun: input.dryRun ?? true,
        traceId: trace.traceId ?? '',
        steps,
        responsePreview: preview,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      AiFlowLogger.error('debug_test', trace, { error: msg });
      return {
        success: false,
        dryRun: input.dryRun ?? true,
        traceId: trace.traceId ?? '',
        steps,
        error: msg,
      };
    }
  }

  private async processMessage(
    tenantId: string,
    sessionId: string,
    customerPhone: string,
    _content: string,
    config: EffectiveAiAgentConfig,
    options: ProcessMessageOptions,
  ): Promise<{ contentPreview?: string } | void> {
    const { trace, dryRun } = options;
    trace.tenantId = tenantId;
    trace.phone = customerPhone;
    trace.sessionId = sessionId;

    AiFlowLogger.flow('process_message_start', trace);

    try {
      if (!config.isEnabled) {
        AiFlowLogger.ignored('ai_disabled_for_tenant', trace);
        return;
      }

      const session =
        (await this.conversationService.getSessionById(sessionId)) ??
        (await this.conversationService.getOrCreateSession(tenantId, customerPhone));

      AiFlowLogger.flow('session_loaded', trace, {
        sessionId: session.id,
        handoffActive: session.handoffActive,
        state: session.state,
      });

      const normalizedContent = _content.trim().toLowerCase();
      if (normalizedContent === '#sair') {
        AiFlowLogger.flow('customer_exit_command', trace, {
          sessionId: session.id,
          customerPhone,
        });
        await this.conversationService.closeSession(session.id, 'customer_exit');

        if (!dryRun) {
          await this.sendFinalResponse(
            tenantId,
            session.id,
            customerPhone,
            'Sessão encerrada. Quando quiser iniciar outra conversa, envie uma nova mensagem.',
            trace,
            config.simulateTyping,
          );
        }

        return;
      }

      if (!config.memoryEnabled) {
        AiFlowLogger.flow('AI_MEMORY memory_disabled', trace, {
          sessionId: session.id,
          tenantId,
        });
        this.logger.log(`[AI_MEMORY] memory_disabled tenantId=${tenantId} sessionId=${session.id}`);
      }

      if (session.handoffActive) {
        AiFlowLogger.ignored('human_handoff', trace, { sessionId: session.id });
        return;
      }

      const aiMemory = await this.conversationService.getSessionAiMemory(session.id);
      AiFlowLogger.flow('AI_MEMORY session_memory_loaded', trace, {
        sessionId: session.id,
      });
      this.logger.log(`[AI_MEMORY] customer_memory_loaded phone=${customerPhone}`);
      const hasAddress = Boolean(
        aiMemory.lastKnownAddress.street ||
          aiMemory.lastKnownAddress.number ||
          aiMemory.lastKnownAddress.city,
      );
      this.logger.log(`[AI_MEMORY] address_memory_loaded hasAddress=${hasAddress}`);
      this.logger.log(`[AI_MEMORY] last_order_loaded hasLastOrder=${Boolean(aiMemory.lastOrderId)}`);

      if (config.memoryEnabled) {
        let extractedName = this.extractCustomerNameFromText(_content);
        // Fallback: se a mensagem tiver exatamente 2 palavras iniciadas por maiúscula (ex: "Emerson Lopes"), assume que é o nome
        if (!extractedName && /^[A-ZÀ-Ÿ][a-zÀ-ÿ]+\s+[A-ZÀ-Ÿ][a-zÀ-ÿ]+$/.test(_content.trim())) {
          extractedName = _content.trim();
        }

        if (
          extractedName &&
          aiMemory.orderDraft.customerName &&
          !this.extractCustomerNameFromText(_content) &&
          (aiMemory.orderDraft.customerName.includes(' ') ||
            aiMemory.orderDraft.fulfillmentType ||
            aiMemory.orderDraft.deliveryAddress.street ||
            (aiMemory.orderDraft.items.length > 0 && aiMemory.orderDraft.customerName.includes(' ')))
        ) {
          extractedName = null;
        }
        
        if (config.rememberCustomerName && extractedName) {
          await this.conversationService.saveCustomerName(
            tenantId,
            customerPhone,
            extractedName,
          );
          await this.conversationService.updateSessionAiMemory(session.id, {
            lastKnownCustomerName: extractedName,
            lastKnownCustomerNameAt: new Date().toISOString(),
          });
          // Salva também no draft
          await this.conversationService.updateOrderDraft(session.id, {
            customerName: extractedName,
          });
          this.logger.log(`[AI_DRAFT] customer_name_set sessionId=${session.id} name="${extractedName}"`);
        }

        const extractedAddress = this.extractSimpleAddressFromText(_content);
        if (config.rememberAddresses && extractedAddress?.street) {
          await this.conversationService.saveLastKnownAddress(session.id, {
            street: extractedAddress.street,
            number: null,
            neighborhood: null,
            city: null,
            state: null,
            zipCode: null,
            complement: null,
            reference: null,
          });
        }
      }

      await this.applyDeterministicDraftCapture(session.id, _content);

      const history = await this.conversationService.getRecentHistory(
        session.id,
        15,
      );

      const systemConfig = await this.prisma.systemConfig.findUnique({
        where: { id: 'global' },
      });
      const providerResolved = await this.aiRegistry.resolveProvider(tenantId);
      AiFlowLogger.flow('provider_resolved', trace, {
        provider: providerResolved.providerType,
        providerSource: 'ai_provider_registry',
      });

      let tools = await this.toolsService.getAvailableToolsForTenant(tenantId);
      if (!config.memoryEnabled || !config.allowRepeatLastOrder) {
        tools = tools.filter((tool) => tool.name !== 'repetir_ultimo_pedido');
      }

      const tenantSettings = await this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { isStorePaused: true },
      });
      const storeStatusRaw = await this.availabilityService.getStoreStatus(tenantId);

      // Detectar primeira mensagem da sessão (histórico de IA vazio ou estado greeting)
      const isFirstMessage = session.state === 'greeting' || !aiMemory.lastAiProcessedAt;

      // Verificar se a loja aceita agendamentos (default true quando fechada)
      const acceptsScheduling = storeStatusRaw.isOpen === false;

      const storeSnapshot = {
        storeStatus: resolveStoreOperationalStatus({
          isStorePaused: tenantSettings?.isStorePaused ?? false,
          isOpen: storeStatusRaw.isOpen,
          reason: storeStatusRaw.reason,
        }),
        message: storeStatusRaw.message,
        nextOpenAt: storeStatusRaw.nextOpenAt ?? null,
        reason: storeStatusRaw.reason,
        acceptsScheduling,
        isFirstMessage,
      };
      const storeStatusBlock = buildStoreStatusPromptBlock(storeSnapshot);
      AiFlowLogger.flow('store_status_injected', trace, {
        storeStatus: storeSnapshot.storeStatus,
        isFirstMessage,
        acceptsScheduling,
      });

      if (isFirstMessage && storeSnapshot.storeStatus !== 'open') {
        this.logger.log(`[AI_SCHEDULING] store_closed scheduling_offered sessionId=${session.id} acceptsScheduling=${acceptsScheduling}`);
      }

      const basePrompt =
        systemConfig?.baseAiPrompt?.trim() || DEFAULT_GLOBAL_BASE_AI_PROMPT;
      const tenantLayer = `
## Contexto do restaurante (complementar — não substitui regras globais)
- Nome: ${config.tenant.name}
- Nome do assistente: ${config.agentName || 'Assistente'}
- Tom de voz: ${config.tone}
- Saudação sugerida (use na primeira interação): ${config.greetingMessage || 'Olá!'}
- Instruções da marca (estilo/promoções locais — NÃO alteram regras de segurança):
${config.customInstructions || 'Atenda com cordialidade e foco em conversão.'}
      `.trim();

      const systemContent = [
        basePrompt,
        storeStatusBlock,
        this.buildDateTimeContextBlock(tenantId),
        tenantLayer,
        buildToolsManifestForPrompt(tools),
      ].join('\n\n');

      const messages: AiMessage[] = [
        { role: 'system', content: systemContent },
      ];

      if (config.memoryEnabled) {
        const memoryPrompt = this.buildSessionMemoryPrompt(aiMemory, config);
        if (memoryPrompt) {
          messages.push({ role: 'system', content: memoryPrompt });
        }
      }

      const agentSessionCtx = await this.conversationService.resolveAgentSessionContext(
        tenantId,
        session.id,
        customerPhone,
      );
      agentSessionCtx.allowRepeatLastOrder = config.allowRepeatLastOrder;
      agentSessionCtx.memoryRetentionDays = config.memoryRetentionDays;
      AiFlowLogger.flow('agent_session_context', trace, {
        customerId: agentSessionCtx.customerId,
      });

      await this.applyDeterministicToolCapture(tenantId, session.id, _content, agentSessionCtx);

      // Garantir customerPhone no draft (preenchido automaticamente)
      if (!aiMemory.orderDraft.customerPhone && customerPhone) {
        await this.conversationService.updateOrderDraft(session.id, {
          customerPhone: customerPhone.replace(/\D/g, ''),
          customerName: aiMemory.orderDraft.customerName || agentSessionCtx.customerName || null,
        });
      }

      // Recarregar memória do AI atualizada do banco para obter o draft correto
      const freshAiMemory = await this.conversationService.getSessionAiMemory(session.id);

      // Injetar CURRENT_ORDER_DRAFT no contexto (independente de memoryEnabled)
      const draftBlock = buildOrderDraftPromptBlock(freshAiMemory.orderDraft);
      if (draftBlock) {
        messages.push({ role: 'system', content: draftBlock });
        this.logger.log(
          `[AI_DRAFT] loaded items=${freshAiMemory.orderDraft.items.length} missing=[${freshAiMemory.orderDraft.missingFields.join(',')}] ready=${freshAiMemory.orderDraft.readyToConfirm} sessionId=${session.id}`,
        );
      }

      for (const msg of history) {
        if (msg.messageType !== 'text' && msg.messageType !== 'tool_result') {
          continue;
        }

        const toolCalls = msg.toolCalls as Prisma.JsonArray | null;

        // If this message is a tool result saved in the DB, represent it as a `tool` role
        // so providers build proper `functionResponse` parts. Otherwise keep user/model roles.
        const role = msg.messageType === 'tool_result' ? 'tool' : (msg.direction === 'inbound' ? 'user' : 'assistant');

        messages.push({
          role,
          content: msg.content,
          ...(toolCalls && Array.isArray(toolCalls)
            ? {
                toolCalls: toolCalls.map((tc) => {
                  const obj = tc as Record<string, unknown>;
                  return {
                    id: String(obj.id),
                    name: String(obj.name),
                    arguments: (obj.arguments || {}) as Record<string, unknown>,
                  };
                }),
              }
            : {}),
        });
      }

      const providerAvailable = await providerResolved.isAvailable();
      AiFlowLogger.flow('llm_provider_check', trace, {
        provider: providerResolved.providerType,
        available: providerAvailable,
        messagesCount: messages.length,
        toolsCount: tools.length,
      });

      if (!providerAvailable) {
        AiFlowLogger.error('llm_provider_unavailable', trace, {
          provider: providerResolved.providerType,
        });
        if (config.fallbackMessage && !dryRun) {
          await this.sendFinalResponse(
            tenantId,
            session.id,
            customerPhone,
            config.fallbackMessage,
            trace,
            config.simulateTyping,
          );
        }
        return;
      }

      await this.trySimulateTyping(
        tenantId,
        customerPhone,
        config.simulateTyping,
        trace,
        dryRun,
        'composing',
      );

      const llmStartedAt = Date.now();
      AiFlowLogger.flow('llm_request_start', trace, {
        provider: providerResolved.providerType,
        inputMessages: messages.length,
      });

      const completion = await providerResolved.complete({
        messages,
        tools,
        temperature: 0.3,
      });

      const llmDurationMs = Date.now() - llmStartedAt;
      const outputLength = completion.content?.length ?? 0;
      const toolCallsCount = completion.toolCalls?.length ?? 0;

      if (completion.finishReason === 'error') {
        AiFlowLogger.error('llm_response_failed', trace, {
          provider: providerResolved.providerType,
          finishReason: completion.finishReason,
          durationMs: llmDurationMs,
        });
        if (config.fallbackMessage && !dryRun) {
          await this.sendFinalResponse(
            tenantId,
            session.id,
            customerPhone,
            config.fallbackMessage,
            trace,
            config.simulateTyping,
          );
        }
        return;
      }

      AiFlowLogger.flow('llm_response_success', trace, {
        provider: providerResolved.providerType,
        finishReason: completion.finishReason,
        length: outputLength,
        toolCallsCount,
        durationMs: llmDurationMs,
        promptTokens: completion.usage?.promptTokens,
        completionTokens: completion.usage?.completionTokens,
      });

      if (
        !completion.content &&
        (!completion.toolCalls || completion.toolCalls.length === 0)
      ) {
        AiFlowLogger.error('llm_empty_response', trace);
        if (config.fallbackMessage && !dryRun) {
          await this.sendFinalResponse(
            tenantId,
            session.id,
            customerPhone,
            config.fallbackMessage,
            trace,
            config.simulateTyping,
          );
        }
        return;
      }

      if (
        completion.finishReason === 'tool_calls' &&
        completion.toolCalls &&
        completion.toolCalls.length > 0
      ) {
        if (dryRun) {
          AiFlowLogger.flow('llm_tool_calls_dry_run', trace, {
            toolCallsCount: completion.toolCalls.length,
          });
          return {
            contentPreview: `[dryRun] tool_calls=${completion.toolCalls.map((t) => t.name).join(',')}`,
          };
        }
        await this.handleToolCalls(
          tenantId,
          session.id,
          customerPhone,
          messages,
          completion.toolCalls,
          tools,
          config,
          trace,
          agentSessionCtx,
        );
        return;
      }

      if (completion.content) {
        if (dryRun) {
          AiFlowLogger.flow('dry_run_skip_whatsapp_send', trace, {
            previewLength: completion.content.length,
          });
          return { contentPreview: completion.content.slice(0, 200) };
        }
        await this.sendFinalResponse(
          tenantId,
          session.id,
          customerPhone,
          completion.content,
          trace,
          config.simulateTyping,
        );
        return { contentPreview: completion.content.slice(0, 200) };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      AiFlowLogger.error('process_message', trace, { error: message });
      this.logger.error(`Error handling inbound message: ${message}`);
      if (config?.fallbackMessage && !options.dryRun) {
        try {
          await this.sendFinalResponse(
            tenantId,
            'error-fallback',
            customerPhone,
            config.fallbackMessage,
            trace,
            config.simulateTyping,
          );
        } catch {
          /* fallback send failed */
        }
      }
      throw error;
    }
  }

  private async handleToolCalls(
    tenantId: string,
    sessionId: string,
    customerPhone: string,
    historyMessages: AiMessage[],
    toolCalls: NonNullable<AiMessage['toolCalls']>,
    tools: ReturnType<AgentToolsService['getAvailableTools']>,
    config: EffectiveAiAgentConfig,
    trace: AiFlowContext,
    agentSessionCtx: AgentSessionContext,
  ): Promise<void> {
    AiFlowLogger.flow('tool_calls_start', trace, { count: toolCalls.length });

    const assistantToolMessage: AiMessage = {
      role: 'assistant',
      content: '',
      toolCalls: toolCalls,
    };

    await this.conversationService.addMessage({
      sessionId,
      direction: 'outbound',
      senderType: 'system',
      content: '',
      messageType: 'tool_call',
      externalStatus: 'sent',
      timestamp: new Date(),
      toolCalls: toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments as Prisma.InputJsonObject,
      })) as Prisma.InputJsonArray,
      metadata: {
        type: 'tool_call',
        hiddenFromInbox: true,
      },
    });

    const newMessages = [...historyMessages, assistantToolMessage];

    let createdOrderResult: { orderId: string; orderNumber?: string; totalAmount?: number } | null = null;

    for (const toolCall of toolCalls) {
      const signatureHash = this.hashToolArgs(toolCall.arguments);

      if (toolCall.name === 'transferir_atendimento_humano') {
        const args = toolCall.arguments as Record<string, unknown>;
        const motivo =
          typeof args === 'object' && args !== null && 'motivo' in args
            ? String(args.motivo)
            : undefined;
        await this.conversationService.activateHandoff(sessionId, motivo);
        await this.sendFinalResponse(
          tenantId,
          sessionId,
          customerPhone,
          'Certo, estou transferindo você para um de nossos atendentes. Por favor, aguarde um momento.',
          trace,
          config.simulateTyping,
        );
        return;
      }

      const shouldBlock = await this.conversationService.shouldBlockAiToolCall({
        sessionId,
        toolName: toolCall.name,
        signatureHash,
        maxFailures: 2,
        windowMs: 5 * 60 * 1000,
      });

      if (shouldBlock) {
        AiFlowLogger.ignored('tool_loop_blocked', trace, { tool: toolCall.name });
        await this.sendFinalResponse(
          tenantId,
          sessionId,
          customerPhone,
          'Tive um problema ao processar essa solicitação automaticamente. Pode reformular a mensagem com mais detalhes, por favor?',
          trace,
          config.simulateTyping,
        );
        return;
      }

      AiFlowLogger.flow('tool_call_start', trace, {
        name: toolCall.name,
        toolId: toolCall.id,
        signatureHash,
      });

      if (toolCall.name === 'repetir_ultimo_pedido') {
        AiFlowLogger.flow('repeat_last_order_requested', trace, {
          toolId: toolCall.id,
          sessionId,
        });
        this.logger.log(`[AI_MEMORY] repeat_last_order_requested tenantId=${tenantId} sessionId=${sessionId}`);
      }

      if (toolCall.name === 'criar_pedido') {
        AiFlowLogger.flow('order_creation_start', trace, {
          toolId: toolCall.id,
          toolName: toolCall.name,
        });
        this.logger.log(`[AI_ORDER] create_order_start sessionId=${sessionId}`);
      }

      const result = await this.toolsService.executeTool(
        tenantId,
        toolCall.name,
        toolCall.arguments,
        agentSessionCtx,
      );

      // capture created order details to generate a system confirmation
      if (toolCall.name === 'criar_pedido') {
        const toolStatusLocal = this.getToolResultStatus(result);
        if (toolStatusLocal === 'success') {
          const orderId = this.getOrderIdFromToolResult(result);
          const orderNumber = result && typeof result === 'object' && 'orderNumber' in result ? String((result as Record<string, unknown>).orderNumber) : undefined;
          const totalAmount = result && typeof result === 'object' && 'totalAmount' in result ? Number((result as Record<string, unknown>).totalAmount) : undefined;
          if (orderId) {
            createdOrderResult = { orderId, orderNumber, totalAmount };
            this.logger.log(`[AI_ORDER] create_order_success orderId=${orderId} sessionId=${sessionId}`);
          }
        }
      }

      const toolStatus = this.getToolResultStatus(result);
      const toolCode = this.getToolResultCode(result);

      AiFlowLogger.flow('tool_call_success', trace, {
        name: toolCall.name,
        toolId: toolCall.id,
        status: toolStatus,
      });

      newMessages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: JSON.stringify(result),
      });

      await this.conversationService.addMessage({
        sessionId,
        direction: 'outbound',
        senderType: 'system',
        content: JSON.stringify(result),
        messageType: 'tool_result',
        externalStatus: 'sent',
        timestamp: new Date(),
        metadata: {
          type: 'tool_result',
          hiddenFromInbox: true,
          toolName: toolCall.name,
          status: toolStatus,
          code: toolCode,
          signatureHash,
        },
      });

      // Logs obrigatórios adicionais
      if (toolCall.name === 'adicionar_item_pedido' && toolStatus === 'success') {
        this.logger.log(`[AI_DRAFT] item_added sessionId=${sessionId}`);
      }
      if (toolCall.name === 'definir_entrega_retirada' && toolStatus === 'success') {
        const payload = toolCall.arguments as { tipo?: string };
        this.logger.log(`[AI_DRAFT] fulfillment_set ${payload.tipo || ''} sessionId=${sessionId}`);
      }
      if (toolCall.name === 'definir_endereco_entrega' && toolStatus === 'success') {
        this.logger.log(`[AI_DRAFT] address_updated sessionId=${sessionId}`);
      }
      if (toolCall.name === 'definir_forma_pagamento' && toolStatus === 'success') {
        const payload = toolCall.arguments as { metodo?: string; troco?: number };
        this.logger.log(`[AI_DRAFT] payment_set ${payload.metodo || ''} sessionId=${sessionId}`);
        if (payload.troco !== undefined) {
          this.logger.log(`[AI_DRAFT] change_for_set sessionId=${sessionId}`);
        }
      }
      if (toolCall.name === 'consultar_resumo_pedido' && toolStatus === 'success') {
        this.logger.log(`[AI_DRAFT] missing_fields sessionId=${sessionId}`);
        const res = result as { readyToConfirm?: boolean };
        if (res.readyToConfirm) {
          this.logger.log(`[AI_DRAFT] ready_to_confirm sessionId=${sessionId}`);
        }
      }

      if (
        toolCall.name === 'repetir_ultimo_pedido' &&
        toolStatus === 'success' &&
        result &&
        typeof result === 'object'
      ) {
        const orderId = this.getOrderIdFromToolResult(result);
        const orderItems = Array.isArray((result as Record<string, unknown>).items)
          ? ((result as Record<string, unknown>).items as Array<Record<string, unknown>>)
          : [];
        await this.conversationService.updateSessionAiMemory(sessionId, {
          orderDraft: {
            items: orderItems.map((item) => ({
              productId: item.productId ? String(item.productId) : null,
              productName: item.productName ? String(item.productName) : null,
              quantity: item.quantity ? Number(item.quantity) : 1,
              notes: null,
            })),
            fulfillmentType: null,
            customerName: null,
            customerPhone: null,
            deliveryAddress: {
              street: null,
              number: null,
              neighborhood: null,
              city: null,
              state: null,
              zipCode: null,
              complement: null,
              reference: null,
              lat: null,
              lng: null,
            },
            payment: {
              method: null,
              changeFor: null,
            },
            deliveryFee: null,
            subtotal: null,
            total: typeof (result as Record<string, unknown>).total === 'number'
              ? (result as Record<string, unknown>).total as number
              : null,
            missingFields: [],
            readyToConfirm: false,
            confirmationAskedAt: null,
            scheduledFor: null,
          },
          lastOrderSummary: orderId ? `Pedido repetido ${orderId}` : 'Pedido repetido',
        });
        AiFlowLogger.flow('repeat_last_order_draft_created', trace, {
          sessionId,
          orderId,
        });
        this.logger.log(`[AI_MEMORY] repeat_last_order_draft_created tenantId=${tenantId} sessionId=${sessionId} orderId=${orderId ?? 'unknown'}`);
      }

      AiFlowLogger.flow('tool_result_hidden_from_customer', trace, {
        name: toolCall.name,
        toolId: toolCall.id,
        status: toolStatus,
      });

      if (toolCall.name === 'criar_pedido') {
        const toolResultOrderId = this.getOrderIdFromToolResult(result);

        if (toolStatus !== 'success' || !toolResultOrderId) {
          AiFlowLogger.error('order_creation_inconsistent', trace, {
            toolId: toolCall.id,
            orderId: toolResultOrderId || 'unknown',
          });
          await this.sendFinalResponse(
            tenantId,
            sessionId,
            customerPhone,
            'Desculpe, não consegui criar seu pedido corretamente. Vou pedir a um atendente para verificar o seu caso.',
            trace,
            config.simulateTyping,
          );
          return;
        }

        const existingOrder = await this.prisma.order.findUnique({
          where: { id: toolResultOrderId },
          select: {
            id: true,
            orderNumber: true,
            items: {
              select: {
                quantity: true,
                snapshotName: true,
              },
            },
          },
        });

        if (!existingOrder) {
          AiFlowLogger.error('order_creation_inconsistent', trace, {
            orderId: toolResultOrderId,
          });
          await this.sendFinalResponse(
            tenantId,
            sessionId,
            customerPhone,
            'Desculpe, houve um problema ao registrar seu pedido. Um atendente irá verificar em instantes.',
            trace,
            config.simulateTyping,
          );
          return;
        }

        AiFlowLogger.flow('order_creation_success', trace, {
          orderId: toolResultOrderId,
        });
        AiFlowLogger.flow('order_visible_in_orders_endpoint', trace, {
          orderId: toolResultOrderId,
        });

        if (config.memoryEnabled && config.rememberLastOrder) {
          const summaryItems = existingOrder.items
            .map((item) => `${item.quantity}x ${item.snapshotName}`)
            .join(', ');
          await this.conversationService.updateSessionAiMemory(sessionId, {
            lastOrderId: existingOrder.id,
            lastOrderSummary: `#${existingOrder.orderNumber}: ${summaryItems}`,
            lastOrderCreatedAt: new Date().toISOString(),
          });
        }

        // Limpar o orderDraft após criação bem-sucedida
        await this.conversationService.clearOrderDraft(sessionId);
        AiFlowLogger.flow('order_draft_cleared', trace, { sessionId, orderId: toolResultOrderId });
        this.logger.log(`[AI_ORDER] create_order_success orderId=${toolResultOrderId} sessionId=${sessionId}`);
      }

      if (toolStatus === 'success') {
        await this.conversationService.clearAiToolFailures(
          sessionId,
          toolCall.name,
        );
      } else if (toolStatus === 'error') {
        await this.conversationService.recordAiToolFailure({
          sessionId,
          toolName: toolCall.name,
          signatureHash,
          errorCode: toolCode || 'UNKNOWN',
        });

        if (toolCode === 'INVALID_TOOL_ARGS') {
          await this.sendFinalResponse(
            tenantId,
            sessionId,
            customerPhone,
            'Não consegui entender alguns dados necessários para continuar. Pode enviar novamente com as informações completas (ex: itens, endereço e forma de pagamento), por favor?',
            trace,
            config.simulateTyping,
          );
          return;
        }
      }
    }

    const aiProvider = await this.aiRegistry.resolveProvider(tenantId);

    await this.trySimulateTyping(
      tenantId,
      customerPhone,
      config.simulateTyping,
      trace,
      false,
      'composing',
    );

    // If we created an order via a tool, send a safe, system-generated confirmation
    if (createdOrderResult) {
      AiFlowLogger.flow('order_confirmation_by_system', trace, {
        orderId: createdOrderResult.orderId,
        orderNumber: createdOrderResult.orderNumber,
      });

      const formattedTotal = typeof createdOrderResult.totalAmount === 'number'
        ? ` R$ ${createdOrderResult.totalAmount.toFixed(2)}`
        : '';

      const confirmationMessage = createdOrderResult.orderNumber
        ? `Seu pedido ${createdOrderResult.orderNumber} foi criado com sucesso!${formattedTotal ? ` O total é${formattedTotal}.` : ''} Em breve enviaremos atualizações pelo WhatsApp.`
        : `Seu pedido foi criado com sucesso!${formattedTotal ? ` O total é${formattedTotal}.` : ''} Em breve enviaremos atualizações pelo WhatsApp.`;

      this.logger.log(`[AI_ORDER] confirmation_requested sessionId=${sessionId}`);

      await this.sendFinalResponse(
        tenantId,
        sessionId,
        customerPhone,
        confirmationMessage,
        trace,
        config.simulateTyping,
      );

      // stop here to avoid sending any LLM-generated confirmation that might contradict actual order state
      return;
    }

    AiFlowLogger.flow('llm_request_start', trace, {
      provider: aiProvider.providerType,
      phase: 'after_tools',
    });

    const finalCompletion = await aiProvider.complete({
      messages: newMessages,
      tools,
      temperature: 0.3,
    });

    if (finalCompletion.finishReason === 'error') {
      AiFlowLogger.error('llm_response_failed', trace, {
        provider: aiProvider.providerType,
        phase: 'after_tools',
        finishReason: finalCompletion.finishReason,
      });
    } else {
      AiFlowLogger.flow('llm_response_success', trace, {
        provider: aiProvider.providerType,
        phase: 'after_tools',
        length: finalCompletion.content?.length ?? 0,
        finishReason: finalCompletion.finishReason,
      });
    }

    if (finalCompletion.content) {
      await this.sendFinalResponse(
        tenantId,
        sessionId,
        customerPhone,
        finalCompletion.content,
        trace,
        config.simulateTyping,
      );
    }
  }

  private stableStringify(value: unknown): string {
    const visit = (v: unknown): unknown => {
      if (v === null) return null;
      const t = typeof v;
      if (t === 'string' || t === 'number' || t === 'boolean') return v;
      if (Array.isArray(v)) return v.map(visit);
      if (t === 'object') {
        const obj = v as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          out[k] = visit(obj[k]);
        }
        return out;
      }
      return String(v);
    };

    try {
      return JSON.stringify(visit(value));
    } catch {
      return '"<unstringifiable>"';
    }
  }

  private hashToolArgs(args: unknown): string {
    const payload = this.stableStringify(args);
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
  }

  private getToolResultStatus(result: unknown): 'success' | 'error' | 'unknown' {
    if (!result || typeof result !== 'object') return 'unknown';
    if (!('status' in result)) return 'unknown';
    const status = (result as Record<string, unknown>).status;
    if (status === 'success') return 'success';
    if (status === 'error') return 'error';
    return 'unknown';
  }

  private getToolResultCode(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null;
    if (!('code' in result)) return null;
    const code = (result as Record<string, unknown>).code;
    return typeof code === 'string' ? code : null;
  }

  private getOrderIdFromToolResult(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null;
    const orderId = (result as Record<string, unknown>).orderId;
    if (typeof orderId === 'string' && orderId.trim() !== '') return orderId;
    if (typeof orderId === 'number') return String(orderId);
    return null;
  }

  private sanitizeFinalResponse(content: string): { sanitized: string; removedToolOutput: boolean } {
    const trimQuotes = (value: string) => value.trim();

    const findJsonBlockEndIndex = (text: string): number => {
      const firstChar = text[0];
      if (firstChar !== '{' && firstChar !== '[') return -1;

      const stack: string[] = [firstChar];
      let inString = false;
      let escaped = false;

      for (let i = 1; i < text.length; i += 1) {
        const char = text[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (char === '{' || char === '[') {
          stack.push(char);
          continue;
        }
        if ((char === '}' && stack[stack.length - 1] === '{') || (char === ']' && stack[stack.length - 1] === '[')) {
          stack.pop();
          if (stack.length === 0) {
            return i;
          }
        }
      }
      return -1;
    };

    const stripLeadingJsonBlock = (text: string): string => {
      const trimmed = text.trimStart();
      if (!trimmed) return text;
      const endIndex = findJsonBlockEndIndex(trimmed);
      if (endIndex < 0) return text;
      return trimmed.slice(endIndex + 1).trimStart();
    };

    let sanitized = content;
    let removedToolOutput = false;

    const removeToolOutputPrefix = (text: string): string => {
      const trimmed = text.trimStart();
      const prefixRegex = /^(tool_outputs|tool_output|tool_result|tool_call)\b/i;
      if (!prefixRegex.test(trimmed)) return text;
      removedToolOutput = true;
      const withoutPrefix = trimmed.replace(prefixRegex, '').trimStart();
      return stripLeadingJsonBlock(withoutPrefix).trimStart();
    };

    const removeJsonPrefix = (text: string): string => {
      const stripped = stripLeadingJsonBlock(text);
      if (stripped !== text) {
        removedToolOutput = true;
      }
      return stripped;
    };

    // Remove any inline occurrences like "tool_result { ... }" or "tool_output: [ ... ]"
    const removeInlineToolJsonBlocks = (text: string): string => {
      const keywords = ['tool_outputs', 'tool_output', 'tool_result', 'tool_call'];
      let out = text;
      for (const key of keywords) {
        let idx = out.toLowerCase().indexOf(key);
        while (idx >= 0) {
          // find first brace after the keyword
          const after = out.slice(idx + key.length);
          const braceIndex = after.search(/[\[{]/);
          if (braceIndex >= 0) {
            const jsonStart = idx + key.length + braceIndex + 1 - 1; // position of brace
            const sub = out.slice(jsonStart);
            const endOffset = findJsonBlockEndIndex(sub);
            if (endOffset >= 0) {
              // remove keyword up to end of JSON block
              const removeStart = idx;
              const removeEnd = jsonStart + endOffset + 1;
              out = (out.slice(0, removeStart) + out.slice(removeEnd)).trim();
              removedToolOutput = true;
            } else {
              // no balanced JSON found; remove the keyword only
              out = (out.slice(0, idx) + out.slice(idx + key.length)).trim();
              removedToolOutput = true;
            }
          } else {
            // no brace after keyword; just remove the keyword
            out = (out.slice(0, idx) + out.slice(idx + key.length)).trim();
            removedToolOutput = true;
          }
          idx = out.toLowerCase().indexOf(key);
        }
      }
      return out;
    };

    while (true) {
      const trimmed = sanitized.trimStart();
      const prefixRegex = /^(tool_outputs|tool_output|tool_result|tool_call)\b/i;
      if (prefixRegex.test(trimmed)) {
        sanitized = removeToolOutputPrefix(trimmed);
        continue;
      }
      const next = removeJsonPrefix(trimmed);
      if (next !== trimmed) {
        sanitized = next;
        continue;
      }
      break;
    }

    // also remove any inline tool JSON blocks that may appear later in the text
    sanitized = removeInlineToolJsonBlocks(sanitized);

    // Remove any standalone JSON blocks anywhere in the text (avoid removing tiny braces)
    const removeAllJsonBlocksAnywhere = (text: string): string => {
      let out = text;
      let idx = Math.min(
        ...['{', '[']
          .map((c) => {
            const i = out.indexOf(c);
            return i >= 0 ? i : Infinity;
          })
      );

      while (idx !== Infinity && idx >= 0) {
        const sub = out.slice(idx);
        const end = findJsonBlockEndIndex(sub);
        if (end >= 0 && end > 10) {
          out = (out.slice(0, idx) + out.slice(idx + end + 1)).trim();
          removedToolOutput = true;
        } else {
          // if not a valid JSON block, skip this brace
          const nextIdx = Math.min(
            ...['{', '[']
              .map((c) => {
                const i = out.indexOf(c, idx + 1);
                return i >= 0 ? i : Infinity;
              })
          );
          if (nextIdx === Infinity) break;
          idx = nextIdx;
        }
        idx = Math.min(
          ...['{', '[']
            .map((c) => {
              const i = out.indexOf(c);
              return i >= 0 ? i : Infinity;
            })
        );
      }
      return out;
    };

    sanitized = removeAllJsonBlocksAnywhere(sanitized);

    // Limpar crases/backticks residuais caso a resposta venha cercada por blocos de código markdown vazios
    sanitized = sanitized.replace(/`/g, '').trim();

    sanitized = sanitized.trim();
    if (!sanitized) {
      removedToolOutput = true;
      sanitized = 'Desculpe, não consegui gerar uma resposta clara no momento. Vou pedir para um atendente verificar.';
    }

    return { sanitized: trimQuotes(sanitized), removedToolOutput };
  }

  /**
   * Presença/digitação — best-effort; falha não interrompe o fluxo da IA.
   */
  private async trySimulateTyping(
    tenantId: string,
    customerPhone: string,
    tenantSimulateTyping: boolean,
    trace: AiFlowContext,
    dryRun: boolean | undefined,
    state: 'composing' | 'recording' | 'paused',
  ): Promise<void> {
    if (dryRun || !shouldSimulateTyping(tenantSimulateTyping)) {
      return;
    }

    await this.whatsappSender.sendPresence(
      tenantId,
      customerPhone,
      state,
      trace,
    );

    if (state === 'composing') {
      const key = `${tenantId}:${customerPhone}`;
      this.typingStartedAt.set(key, Date.now());
    }
  }

  /** Aguarda tempo mínimo de "digitando..." antes de enviar texto */
  private async ensureTypingMinDelay(
    tenantId: string,
    customerPhone: string,
    trace: AiFlowContext,
    tenantSimulateTyping: boolean,
  ): Promise<void> {
    if (!shouldSimulateTyping(tenantSimulateTyping)) {
      return;
    }

    const key = `${tenantId}:${customerPhone}`;
    const started = this.typingStartedAt.get(key);
    if (!started) return;

    const minDelay = getTypingDelayMs();
    const elapsed = Date.now() - started;
    const waitMs = minDelay - elapsed;

    if (waitMs > 0) {
      AiFlowLogger.flow('typing_delay_wait', trace, { waitMs, minDelayMs: minDelay });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    this.typingStartedAt.delete(key);
  }

  private async sendFinalResponse(
    tenantId: string,
    sessionId: string,
    customerPhone: string,
    content: string,
    trace: AiFlowContext,
    tenantSimulateTyping = false,
  ): Promise<void> {
    const { sanitized, removedToolOutput } = this.sanitizeFinalResponse(content);
    if (removedToolOutput) {
      AiFlowLogger.flow('final_response_sanitized', trace, {
        removedToolOutput: true,
      });
    }

    await this.ensureTypingMinDelay(
      tenantId,
      customerPhone,
      trace,
      tenantSimulateTyping,
    );

    AiFlowLogger.flow('whatsapp_send_start', trace, {
      textLength: sanitized.length,
      text: sanitized,
    });
    this.logger.log(`[AI_RESPONSE] send_text text="${sanitized}" sessionId=${sessionId}`);

    try {
      // Duplicate suppression: check last outbound AI message
      try {
        if (sessionId !== 'error-fallback') {
          const recent = await this.conversationService.getRecentHistory(sessionId, 5);
          for (let i = recent.length - 1; i >= 0; i--) {
            const m = recent[i] as { direction?: string; senderType?: string; content?: string; timestamp?: Date };
            if (m.direction === 'outbound' && m.senderType === 'ai' && typeof m.content === 'string') {
              const lastTs = m.timestamp ? new Date(m.timestamp).getTime() : 0;
              const now = Date.now();
              const ageMs = now - lastTs;
              if (m.content === sanitized && ageMs <= 10_000) {
                AiFlowLogger.flow('duplicate_ai_response_suppressed', trace, { sessionId, ageMs });
                return;
              }
              break;
            }
          }
        }
      } catch (err: unknown) {
        // Non-fatal; continue to send if history check fails
        AiFlowLogger.flow('duplicate_check_failed', trace, { error: err instanceof Error ? err.message : String(err) });
      }

      const result = await this.whatsappSender.sendText(tenantId, {
        to: customerPhone,
        text: sanitized,
      });

      if (!result.success) {
        AiFlowLogger.error('whatsapp_send', trace, { error: result.error });
        throw new Error(result.error || 'WhatsApp send failed');
      }

      AiFlowLogger.flow('whatsapp_send_success', trace, {
        messageId: result.messageId,
      });

      if (sessionId !== 'error-fallback') {
        await this.conversationService.addMessage({
          sessionId,
          direction: 'outbound',
          senderType: 'ai',
          content: sanitized,
          externalStatus: 'sent',
          timestamp: new Date(),
        });
      }
    } finally {
      await this.trySimulateTyping(
        tenantId,
        customerPhone,
        tenantSimulateTyping,
        trace,
        false,
        'paused',
      );
    }
  }
}
