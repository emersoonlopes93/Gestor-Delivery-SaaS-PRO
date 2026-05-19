import { Injectable, Logger } from '@nestjs/common';
import { AiAgentConfigService } from './ai-agent-config.service';
import { ConversationService } from './conversation.service';
import { AgentToolsService } from './agent-tools.service';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';
import { AiProviderRegistryService } from './ai-provider-registry.service';
import type { AiMessage } from '../interfaces/ai-provider.interface';

import { PrismaService } from '../../database/prisma.service';

import { Prisma } from '@prisma/client';

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger('AiOrchestratorService');

  constructor(
    private readonly configService: AiAgentConfigService,
    private readonly conversationService: ConversationService,
    private readonly toolsService: AgentToolsService,
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly aiRegistry: AiProviderRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Ponto de entrada principal para mensagens inbound do WhatsApp.
   * Deve ser chamado pelo event listener do webhook.
   */
  async handleInboundMessage(tenantId: string, customerPhone: string, _content: string) {
    try {
      const config = await this.configService.getConfig(tenantId);
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
        
        messages.push({
          role: msg.direction === 'inbound' ? 'user' : 'assistant',
          content: msg.content,
          ...(msg.toolCalls && Array.isArray(msg.toolCalls) ? { 
            toolCalls: msg.toolCalls.map(tc => {
              const obj = tc as Record<string, unknown>;
              return {
                id: String(obj.id),
                name: String(obj.name),
                arguments: obj.arguments as Record<string, unknown>
              };
            })
          } : {}),
        });
      }

      // Pega tools disponíveis
      const tools = this.toolsService.getAvailableTools();

      // Resolve o provider (dinâmico por tenant/global)
      const aiProvider = await this.aiRegistry.resolveProvider(tenantId);

      // Envia pro LLM
      const completion = await aiProvider.complete({
        messages,
        tools,
        temperature: 0.3, // Menos alucinação
      });

      // Se o LLM resolveu chamar Tools
      if (completion.finishReason === 'tool_calls' && completion.toolCalls && completion.toolCalls.length > 0) {
        await this.handleToolCalls(tenantId, session.id, customerPhone, messages, completion.toolCalls, tools);
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
        const config = await this.configService.getConfig(tenantId);
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
    tools: ReturnType<AgentToolsService['getAvailableTools']>
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
      // Verifica se é handoff
      if (toolCall.name === 'transferir_atendimento_humano') {
        const motivo = typeof toolCall.arguments === 'object' && toolCall.arguments !== null && 'motivo' in toolCall.arguments 
          ? String(toolCall.arguments.motivo) 
          : undefined;
        await this.conversationService.activateHandoff(sessionId, motivo);
        await this.sendFinalResponse(tenantId, sessionId, customerPhone, "Certo, estou transferindo você para um de nossos atendentes. Por favor, aguarde um momento.");
        return; // Interrompe o fluxo da IA
      }

      // Executa a tool
      const result = await this.toolsService.executeTool(
        tenantId, 
        toolCall.name, 
        toolCall.arguments, 
        { sessionId } // Contexto injetado
      );

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
      });
    }

    // Chama o LLM novamente com os resultados
    const aiProvider = await this.aiRegistry.resolveProvider(tenantId);
    
    const finalCompletion = await aiProvider.complete({
      messages: newMessages,
      tools,
      temperature: 0.3,
    });

    if (finalCompletion.content) {
      await this.sendFinalResponse(tenantId, sessionId, customerPhone, finalCompletion.content);
    }
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
