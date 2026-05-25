import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { AiAgentConfigService } from './ai-agent-config.service';
import { ConversationService } from './conversation.service';
import { AgentToolsService } from './agent-tools.service';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';
import { AiProviderRegistryService } from './ai-provider-registry.service';
import { AdminModulesService } from '../../admin/modules/admin-modules.service';
import type { AiMessage } from '../interfaces/ai-provider.interface';

import { PrismaService } from '../../database/prisma.service';

import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';

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
   * Deve ser chamado pelo event listener do webhook.
   */
  async handleInboundMessage(tenantId: string, customerPhone: string, content: string) {
    // 1. Verificar se o tenant tem acesso ao módulo de IA
    const hasModuleAccess = await this.adminModulesService.hasModuleAccess(tenantId, 'ai_agent');
    if (!hasModuleAccess) {
      this.logger.debug(`Tenant ${tenantId} does not have access to ai_agent module. Skipping.`);
      return;
    }

    const debounceKey = `${tenantId}:${customerPhone}`;
    
    // Limpa timer anterior se existir
    if (this.debounceTimers.has(debounceKey)) {
      clearTimeout(this.debounceTimers.get(debounceKey));
    }

    const config = await this.configService.getConfig(tenantId);
    const debounceMs = config.debounceMs || 1000;

    // Define novo timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
      this.processMessage(tenantId, customerPhone, content, config)
        .catch(err => this.logger.error(`Error processing message for ${customerPhone}: ${err.message}`));
    }, debounceMs);

    this.debounceTimers.set(debounceKey, timer);
  }

  private async processMessage(
    tenantId: string, 
    customerPhone: string, 
    _content: string, 
    config: Awaited<ReturnType<AiAgentConfigService['getConfig']>>
  ) {
    try {
      if (!config.isEnabled) {
        this.logger.debug(`Agent is disabled for tenant ${tenantId}. Ignoring.`);
        return;
      }

      const session = await this.conversationService.getOrCreateSession(tenantId, customerPhone);

      // Se está em Handoff, não responde como bot
      if (session.handoffActive) {
        this.logger.debug(`Session ${session.id} is in handoff. Bot muted.`);
        return;
      }

      // Adiciona mensagem do usuário ao histórico local (se já não foi salva pelo webhook)
      // O webhook já deve ter salvo.

      // Busca histórico recente
      const history = await this.conversationService.getRecentHistory(session.id, 15);

      // Busca Configuração Global (SystemConfig)
      const systemConfig = await this.prisma.systemConfig.findUnique({ where: { id: 'global' } });

      // Constrói array de mensagens pro LLM
      const basePrompt = systemConfig?.baseAiPrompt || 'Você é um assistente virtual de delivery.';
      const agentContext = `
Você está atendendo para o restaurante: ${config.tenant.name}.
Seu nome é: ${config.agentName || 'Assistente'}.
Seu tom de voz deve ser: ${config.tone}.
Sempre comece o atendimento com esta saudação: ${config.greetingMessage || 'Olá!'}.

Instruções específicas do restaurante:
${config.customInstructions || 'Atenda o cliente da melhor forma possível.'}
      `.trim();

      const messages: AiMessage[] = [
        { role: 'system', content: `${basePrompt}\n\n${agentContext}` }
      ];

      for (const msg of history) {
        // Ignora mensagens que não sejam texto/tool do fluxo principal
        if (msg.messageType !== 'text' && msg.messageType !== 'tool_result') continue;
        
        const toolCalls = msg.toolCalls as Prisma.JsonArray | null;
        
        messages.push({
          role: msg.direction === 'inbound' ? 'user' : 'assistant',
          content: msg.content,
          ...(toolCalls && Array.isArray(toolCalls) ? { 
            toolCalls: toolCalls.map(tc => {
              const obj = tc as Record<string, unknown>;
              return {
                id: String(obj.id),
                name: String(obj.name),
                arguments: (obj.arguments || {}) as Record<string, unknown>
              };
            })
          } : {}),
        });
      }

      // Pega tools disponíveis
      const tools = this.toolsService.getAvailableTools();

      // Resolve o provider (dinâmico por tenant/global)
      const aiProvider = await this.aiRegistry.resolveProvider(tenantId);

      // Simulação de digitando (se habilitado)
      if (config.simulateTyping) {
        await this.whatsappSender.sendPresence(tenantId, customerPhone, 'composing');
      }

      // Envia pro LLM
      const completion = await aiProvider.complete({
        messages,
        tools,
        temperature: 0.3, // Menos alucinação
      });

      // Se o LLM resolveu chamar Tools
      if (completion.finishReason === 'tool_calls' && completion.toolCalls && completion.toolCalls.length > 0) {
        await this.handleToolCalls(tenantId, session.id, customerPhone, messages, completion.toolCalls, tools, config);
        return;
      }

      // Se for apenas resposta de texto
      if (completion.content) {
        await this.sendFinalResponse(tenantId, session.id, customerPhone, completion.content);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling inbound message: ${message}`);
      // Fallback
      try {
        if (config?.fallbackMessage) {
          await this.sendFinalResponse(tenantId, 'error-fallback', customerPhone, config.fallbackMessage);
        }
      } catch {}
    }
  }

  private async handleToolCalls(
    tenantId: string, 
    sessionId: string, 
    customerPhone: string,
    historyMessages: AiMessage[],
    toolCalls: NonNullable<AiMessage['toolCalls']>,
    tools: ReturnType<AgentToolsService['getAvailableTools']>,
    config: Awaited<ReturnType<AiAgentConfigService['getConfig']>>
  ) {
    this.logger.log(`Handling ${toolCalls.length} tool calls for session ${sessionId}`);

    // Adiciona a chamada da tool no histórico para o LLM não se perder
    const assistantToolMessage: AiMessage = {
      role: 'assistant',
      content: '',
      toolCalls: toolCalls,
    };
    
    // Salva a mensagem do assistant chamando a tool no banco
    await this.conversationService.addMessage({
      sessionId,
      direction: 'outbound',
      content: '', // Sem texto visível
      toolCalls: toolCalls.map(tc => ({ 
        id: tc.id, 
        name: tc.name, 
        arguments: tc.arguments as Prisma.InputJsonObject 
      })) as Prisma.InputJsonArray,
      metadata: { type: 'tool_call' }
    });

    const newMessages = [...historyMessages, assistantToolMessage];

    for (const toolCall of toolCalls) {
      const signatureHash = this.hashToolArgs(toolCall.arguments);

      // Verifica se é handoff
      if (toolCall.name === 'transferir_atendimento_humano') {
        const args = toolCall.arguments as Record<string, unknown>;
        const motivo = typeof args === 'object' && args !== null && 'motivo' in args 
          ? String(args.motivo) 
          : undefined;
        await this.conversationService.activateHandoff(sessionId, motivo);
        await this.sendFinalResponse(tenantId, sessionId, customerPhone, "Certo, estou transferindo você para um de nossos atendentes. Por favor, aguarde um momento.");
        return; // Interrompe o fluxo da IA
      }

      const shouldBlock = await this.conversationService.shouldBlockAiToolCall({
        sessionId,
        toolName: toolCall.name,
        signatureHash,
        maxFailures: 2,
        windowMs: 5 * 60 * 1000,
      });

      if (shouldBlock) {
        this.logger.warn(`AI tool call blocked to avoid loop (tenantId=${tenantId}, sessionId=${sessionId}, tool=${toolCall.name}, signature=${signatureHash})`);
        const blockedResult = { status: 'error', code: 'TOOL_LOOP_BLOCKED', message: 'Tool call blocked to avoid loop.' };
        await this.conversationService.addMessage({
          sessionId,
          direction: 'inbound',
          content: JSON.stringify(blockedResult),
          messageType: 'tool_result',
          metadata: {
            type: 'tool_result',
            toolName: toolCall.name,
            status: 'error',
            code: 'TOOL_LOOP_BLOCKED',
            signatureHash,
          },
        });
        await this.sendFinalResponse(
          tenantId,
          sessionId,
          customerPhone,
          'Tive um problema ao processar essa solicitação automaticamente. Pode reformular a mensagem com mais detalhes, por favor?',
        );
        return;
      }

      // Executa a tool
      const result = await this.toolsService.executeTool(
        tenantId, 
        toolCall.name, 
        toolCall.arguments, 
        { sessionId } // Contexto injetado
      );

      const toolStatus = this.getToolResultStatus(result);
      const toolCode = this.getToolResultCode(result);

      // Adiciona o resultado
      newMessages.push({
        role: 'tool',
        toolCallId: toolCall.id,
        content: JSON.stringify(result),
      });

      // Salva o resultado no banco
      await this.conversationService.addMessage({
        sessionId,
        direction: 'inbound', // Tratamos o retorno da tool como input pro LLM ler
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
        await this.conversationService.clearAiToolFailures(sessionId, toolCall.name);
      } else if (toolStatus === 'error') {
        await this.conversationService.recordAiToolFailure({
          sessionId,
          toolName: toolCall.name,
          signatureHash,
          errorCode: toolCode || 'UNKNOWN',
        });

        if (toolCode === 'INVALID_TOOL_ARGS') {
          this.logger.warn(`Invalid tool args (tenantId=${tenantId}, sessionId=${sessionId}, tool=${toolCall.name}, signature=${signatureHash})`);
          await this.sendFinalResponse(
            tenantId,
            sessionId,
            customerPhone,
            'Não consegui entender alguns dados necessários para continuar. Pode enviar novamente com as informações completas (ex: itens, endereço e forma de pagamento), por favor?',
          );
          return;
        }
      }
    }

    // Chama o LLM novamente com os resultados
    const aiProvider = await this.aiRegistry.resolveProvider(tenantId);
    
    // Simulação de digitando novamente antes da resposta final
    if (config.simulateTyping) {
      await this.whatsappSender.sendPresence(tenantId, customerPhone, 'composing');
    }

    const finalCompletion = await aiProvider.complete({
      messages: newMessages,
      tools,
      temperature: 0.3,
    });

    if (finalCompletion.content) {
      await this.sendFinalResponse(tenantId, sessionId, customerPhone, finalCompletion.content);
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

  private async sendFinalResponse(tenantId: string, sessionId: string, customerPhone: string, content: string) {
    // 1. Envia via WhatsApp Channel
    await this.whatsappSender.sendText(tenantId, {
      to: customerPhone,
      text: content,
    });

    // 2. Salva no banco
    if (sessionId !== 'error-fallback') {
      await this.conversationService.addMessage({
        sessionId,
        direction: 'outbound',
        content,
      });
    }
  }
}
