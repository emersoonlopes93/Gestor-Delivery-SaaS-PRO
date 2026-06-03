import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AiProviderConfigService } from '../services/ai-provider-config.service';
import type {
  IAiProvider,
  AiCompletionInput,
  AiCompletionResult,
  AiToolCall,
} from '../interfaces/ai-provider.interface';

/**
 * Provider de IA via Anthropic API (Claude).
 * 
 * Variáveis de ambiente:
 * - ANTHROPIC_API_KEY
 * - ANTHROPIC_MODEL (default: claude-3-5-sonnet-20240620)
 * - ANTHROPIC_VERSION (default: 2023-06-01)
 */
@Injectable()
export class AnthropicProvider implements IAiProvider {
  private readonly logger = new Logger('AnthropicProvider');
  readonly providerType = 'anthropic' as const;

  private get anthropicVersion(): string {
    return process.env.ANTHROPIC_VERSION || '2023-06-01';
  }

  constructor(private readonly providerConfig: AiProviderConfigService) {}

  async isAvailable(): Promise<boolean> {
    const config = await this.providerConfig.resolveRuntimeConfig(this.providerType);
    return config.apiKeyPresent;
  }

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const config = await this.providerConfig.resolveRuntimeConfig(
      this.providerType,
      input.model,
      { log: true, providerSource: input.providerSource, modelOverrideSource: input.modelSource },
    );
    const { apiKey, model } = config;
    if (!apiKey) {
      this.logger.error('Anthropic provider is not configured: API key missing.');
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
        error: {
          type: 'unknown',
          message: 'Anthropic API key ausente. Configure no SaaS Admin ou ENV.',
        },
      };
    }

    // Anthropic separa System Prompt de Mensagens
    const systemMessage = input.messages.find(m => m.role === 'system');
    const conversationMessages = input.messages.filter(m => m.role !== 'system').map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: m.toolCallId,
              content: m.content,
            }
          ]
        };
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            ...m.toolCalls.map(tc => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            }))
          ]
        };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });

    const body: Record<string, unknown> = {
      model,
      messages: conversationMessages,
      max_tokens: input.maxTokens || 4096,
      temperature: input.temperature ?? 0.7,
      system: systemMessage?.content,
    };

    if (input.tools?.length) {
      body.tools = input.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: {
          type: 'object',
          properties: t.parameters.properties,
          required: t.parameters.required,
        },
      }));
    }

    try {
      const { data } = await axios.post(
        'https://api.anthropic.com/v1/messages',
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': this.anthropicVersion,
          },
          timeout: 60_000,
        },
      );

      const content = data.content || [];
      const textBlock = content.find((c: { type: string; text?: string }) => c.type === 'text');
      const toolBlocks = content.filter((c: { type: string; id: string; name: string; input: unknown }) => c.type === 'tool_use');

      const toolCalls: AiToolCall[] = toolBlocks.map((tb: { id: string; name: string; input: unknown }) => ({
        id: tb.id,
        name: tb.name,
        arguments: tb.input,
      }));

      let finishReason: AiCompletionResult['finishReason'] = 'stop';
      if (data.stop_reason === 'tool_use') finishReason = 'tool_calls';
      else if (data.stop_reason === 'max_tokens') finishReason = 'length';

      return {
        content: textBlock?.text || null,
        toolCalls,
        finishReason,
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        } : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Anthropic completion failed: ${message}`);
      let errorType: 'quota_exhausted' | 'model_unavailable' | 'unknown' = 'unknown';
      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;

      if (axios.isAxiosError(error) && error.response?.data) {
        this.logger.error(`Anthropic error details: ${JSON.stringify(error.response.data)}`);
        const responseStr = JSON.stringify(error.response.data);
        const normalizedResponse = responseStr.toLowerCase();
        if (normalizedResponse.includes('429') || normalizedResponse.includes('rate_limit') || normalizedResponse.includes('quota') || normalizedResponse.includes('quota exceeded')) {
          errorType = 'quota_exhausted';
        } else if (normalizedResponse.includes('not_found') || normalizedResponse.includes('model_not_found') || normalizedResponse.includes('does_not_exist') || normalizedResponse.includes('model unavailable')) {
          errorType = 'model_unavailable';
        }
      } else if (typeof message === 'string') {
        const normalizedMessage = message.toLowerCase();
        if (normalizedMessage.includes('429') || normalizedMessage.includes('rate_limit') || normalizedMessage.includes('quota') || normalizedMessage.includes('quota exceeded')) {
          errorType = 'quota_exhausted';
        } else if (normalizedMessage.includes('not_found') || normalizedMessage.includes('model_not_found') || normalizedMessage.includes('does_not_exist') || normalizedMessage.includes('model unavailable')) {
          errorType = 'model_unavailable';
        }
      }

      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
        error: {
          type: errorType,
          message,
          statusCode,
        },
      };
    }
  }
}
