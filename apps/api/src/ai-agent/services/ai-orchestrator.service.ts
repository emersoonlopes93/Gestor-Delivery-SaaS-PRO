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

  constructor(
    private readonly configService: AiAgentConfigService,
    private readonly conversationService: ConversationService,
    private readonly toolsService: AgentToolsService,
    @Inject(forwardRef(() => WhatsAppSenderService))
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly aiRegistry: AiProviderRegistryService,
    private readonly prisma: PrismaService,
    private readonly adminModulesService: AdminModulesService,
  ) {}

  /**
   * Ponto de entrada principal para mensagens inbound do WhatsApp.
   */
  async handleInboundMessage(
    tenantId: string,
    customerPhone: string,
    content: string,
    trace?: AiFlowContext,
  ): Promise<void> {
    const flowTrace = trace ?? createAiTrace();
    flowTrace.tenantId = tenantId;
    flowTrace.phone = customerPhone;

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

    AiFlowLogger.flow('ai_config_loaded', flowTrace, {
      enabled: config.isEnabled,
      provider: providerType,
      model:
        providerType === 'google_ai'
          ? systemConfig?.googleAiModel ?? 'gemini-2.0-flash-lite'
          : providerType === 'anthropic'
            ? process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20240620'
            : process.env.OPENAI_MODEL ?? 'gpt-4o',
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
      this.processMessage(tenantId, customerPhone, content, config, {
        trace: flowTrace,
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        AiFlowLogger.error('process_message', flowTrace, { error: msg });
        this.logger.error(`Error processing message for ${customerPhone}: ${msg}`);
      });
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

      const basePrompt =
        systemConfig?.baseAiPrompt || 'Você é um assistente virtual de delivery.';
      const agentContext = `
Você está atendendo para o restaurante: ${config.tenant.name}.
Seu nome é: ${config.agentName || 'Assistente'}.
Seu tom de voz deve ser: ${config.tone}.
Sempre comece o atendimento com esta saudação: ${config.greetingMessage || 'Olá!'}.

Instruções específicas do restaurante:
${config.customInstructions || 'Atenda o cliente da melhor forma possível.'}
      `.trim();

      const messages: AiMessage[] = [
        { role: 'system', content: `${basePrompt}\n\n${agentContext}` },
      ];

      for (const msg of history) {
        if (msg.messageType !== 'text' && msg.messageType !== 'tool_result') {
          continue;
        }

        const toolCalls = msg.toolCalls as Prisma.JsonArray | null;

        messages.push({
          role: msg.direction === 'inbound' ? 'user' : 'assistant',
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

      const tools = this.toolsService.getAvailableTools();

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
      content: '',
      toolCalls: toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments as Prisma.InputJsonObject,
      })) as Prisma.InputJsonArray,
      metadata: { type: 'tool_call' },
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

      const result = await this.toolsService.executeTool(
        tenantId,
        toolCall.name,
        toolCall.arguments,
        { sessionId },
      );

      const toolStatus = this.getToolResultStatus(result);
      const toolCode = this.getToolResultCode(result);

      newMessages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: JSON.stringify(result),
      });

      await this.conversationService.addMessage({
        sessionId,
        direction: 'inbound',
        content: JSON.stringify(result),
        messageType: 'tool_result',
        metadata: {
          type: 'tool_result',
          toolName: toolCall.name,
          status: toolStatus,
          code: toolCode,
          signatureHash,
        },
      });

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

    AiFlowLogger.flow('llm_response_success', trace, {
      provider: aiProvider.providerType,
      phase: 'after_tools',
      length: finalCompletion.content?.length ?? 0,
      finishReason: finalCompletion.finishReason,
    });

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

    await this.whatsappSender.sendPresence(tenantId, customerPhone, state);
  }

  private async sendFinalResponse(
    tenantId: string,
    sessionId: string,
    customerPhone: string,
    content: string,
    trace: AiFlowContext,
    tenantSimulateTyping = false,
  ): Promise<void> {
    AiFlowLogger.flow('whatsapp_send_start', trace, {
      textLength: content.length,
    });

    try {
      const result = await this.whatsappSender.sendText(tenantId, {
        to: customerPhone,
        text: content,
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
          content,
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
