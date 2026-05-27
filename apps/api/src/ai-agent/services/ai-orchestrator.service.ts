import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { AiAgentConfigService } from './ai-agent-config.service';
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
  /** If a message arrived while processing, store latest content to trigger a rerun */
  private readonly pendingRerunContent = new Map<string, string>();
  /** Keys that need a rerun after current processing finishes */
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

  /**
   * Ponto de entrada principal para mensagens inbound do WhatsApp.
   */
  async handleInboundMessage(
    tenantId: string,
    customerPhone: string,
    content: string,
    trace?: AiFlowContext,
    chatJid?: string,
  ): Promise<void> {
    const flowTrace = trace ?? createAiTrace();
    flowTrace.tenantId = tenantId;
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

    const config = await this.configService.getConfig(tenantId);
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
      agentConfigId: config.id,
      agentName: config.agentName,
      isEnabled: config.isEnabled,
      provider: providerType,
      providerSource: 'system_config',
      model: resolvedModel,
      modelSource,
      debounceMs: config.debounceMs ?? 1000,
      operatingMode: config.operatingMode,
      handoffActive: false,
    });

    if (!config.isEnabled) {
      AiFlowLogger.ignored('ai_disabled_for_tenant', flowTrace);
      return;
    }

    const debounceKey = `${tenantId}:${customerPhone}`;

    if (this.debounceTimers.has(debounceKey)) {
      AiFlowLogger.flow('debounce_reset', flowTrace, { debounceKey });
      clearTimeout(this.debounceTimers.get(debounceKey));
    }

    const debounceMs = config.debounceMs || 1000;
    AiFlowLogger.flow('debounce_scheduled', flowTrace, { delayMs: debounceMs });

    const timer = setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
      AiFlowLogger.flow('debounce_fired', flowTrace);

      // If already processing this session, schedule a rerun with latest content
      if (this.processingSessions.has(debounceKey)) {
        AiFlowLogger.flow('process_skipped_already_running', flowTrace, { debounceKey });
        this.pendingReruns.add(debounceKey);
        this.pendingRerunContent.set(debounceKey, content);
        AiFlowLogger.flow('process_rerun_scheduled', flowTrace, { debounceKey });
        return;
      }

      // Mark processing and run
      this.processingSessions.add(debounceKey);
      (async () => {
        try {
          await this.processMessage(tenantId, customerPhone, content, config, {
            trace: flowTrace,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          AiFlowLogger.error('process_message', flowTrace, { error: msg });
          this.logger.error(`Error processing message for ${customerPhone}: ${msg}`);
        } finally {
          this.processingSessions.delete(debounceKey);

          // If a rerun was requested while processing, schedule it now
          if (this.pendingReruns.has(debounceKey)) {
            this.pendingReruns.delete(debounceKey);
            const nextContent = this.pendingRerunContent.get(debounceKey) ?? '';
            this.pendingRerunContent.delete(debounceKey);
            AiFlowLogger.flow('debounce_scheduled', flowTrace, { delayMs: 50, debounceKey });
            const rerunTimer = setTimeout(() => {
              this.debounceTimers.delete(debounceKey);
              AiFlowLogger.flow('debounce_fired', flowTrace);
              // If still processing, re-schedule; otherwise run immediately
              if (this.processingSessions.has(debounceKey)) {
                this.pendingReruns.add(debounceKey);
                this.pendingRerunContent.set(debounceKey, nextContent);
                AiFlowLogger.flow('process_rerun_scheduled', flowTrace, { debounceKey });
                return;
              }
              this.processingSessions.add(debounceKey);
              (async () => {
                try {
                  await this.processMessage(tenantId, customerPhone, nextContent, config, { trace: flowTrace });
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

    const config = await this.configService.getConfig(tenant.id);
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
      const result = await this.processMessage(
        tenant.id,
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
    customerPhone: string,
    _content: string,
    config: Awaited<ReturnType<AiAgentConfigService['getConfig']>>,
    options: ProcessMessageOptions,
  ): Promise<{ contentPreview?: string } | void> {
    const { trace, dryRun } = options;
    trace.tenantId = tenantId;
    trace.phone = customerPhone;

    AiFlowLogger.flow('process_message_start', trace);

    try {
      if (!config.isEnabled) {
        AiFlowLogger.ignored('ai_disabled_for_tenant', trace);
        return;
      }

      const session = await this.conversationService.getOrCreateSession(
        tenantId,
        customerPhone,
      );

      AiFlowLogger.flow('session_loaded', trace, {
        sessionId: session.id,
        handoffActive: session.handoffActive,
        state: session.state,
      });

      if (session.handoffActive) {
        AiFlowLogger.ignored('human_handoff', trace, { sessionId: session.id });
        return;
      }

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

      const tools = await this.toolsService.getAvailableToolsForTenant(tenantId);

      const tenantSettings = await this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { isStorePaused: true },
      });
      const storeStatusRaw = await this.availabilityService.getStoreStatus(tenantId);
      const storeSnapshot = {
        storeStatus: resolveStoreOperationalStatus({
          isStorePaused: tenantSettings?.isStorePaused ?? false,
          isOpen: storeStatusRaw.isOpen,
          reason: storeStatusRaw.reason,
        }),
        message: storeStatusRaw.message,
        nextOpenAt: storeStatusRaw.nextOpenAt ?? null,
        reason: storeStatusRaw.reason,
      };
      const storeStatusBlock = buildStoreStatusPromptBlock(storeSnapshot);
      AiFlowLogger.flow('store_status_injected', trace, {
        storeStatus: storeSnapshot.storeStatus,
      });

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
        tenantLayer,
        buildToolsManifestForPrompt(tools),
      ].join('\n\n');

      const messages: AiMessage[] = [
        { role: 'system', content: systemContent },
      ];

      const agentSessionCtx = await this.conversationService.resolveAgentSessionContext(
        tenantId,
        session.id,
        customerPhone,
      );
      AiFlowLogger.flow('agent_session_context', trace, {
        customerId: agentSessionCtx.customerId,
      });

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
    config: Awaited<ReturnType<AiAgentConfigService['getConfig']>>,
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

      if (toolCall.name === 'criar_pedido') {
        AiFlowLogger.flow('order_creation_start', trace, {
          toolId: toolCall.id,
          toolName: toolCall.name,
        });
      }

      const result = await this.toolsService.executeTool(
        tenantId,
        toolCall.name,
        toolCall.arguments,
        agentSessionCtx,
      );

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
    });

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
