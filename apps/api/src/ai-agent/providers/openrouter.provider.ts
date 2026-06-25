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
 * Provider de IA via OpenRouter API.
 *
 * Variáveis de ambiente:
 * - OPENROUTER_API_KEY
 * - OPENROUTER_MODEL (default: openrouter/auto)
 * - OPENROUTER_BASE_URL (default: https://openrouter.ai/api/v1)
 */
@Injectable()
export class OpenRouterProvider implements IAiProvider {
  private readonly logger = new Logger('OpenRouterProvider');
  readonly providerType = 'openrouter' as const;

  constructor(private readonly providerConfig: AiProviderConfigService) {}

  private get baseUrl(): string {
    return process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  }

  async isAvailable(): Promise<boolean> {
    const config = await this.providerConfig.resolveRuntimeConfig(this.providerType as import('@prisma/client').AiProviderType);
    return config.apiKeyPresent;
  }

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const config = await this.providerConfig.resolveRuntimeConfig(
      this.providerType as import('@prisma/client').AiProviderType,
      input.model,
      { log: true, providerSource: input.providerSource, modelOverrideSource: input.modelSource },
    );
    const { apiKey, model } = config;
    if (!apiKey) {
      this.logger.error('OpenRouter provider is not configured: API key missing.');
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
        error: {
          type: 'unknown',
          message: 'OpenRouter API key ausente. Configure no SaaS Admin ou ENV.',
        },
      };
    }

    const messages = input.messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          content: m.content,
          tool_call_id: m.toolCallId,
        };
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: input.temperature ?? 0.7,
    };

    if (input.maxTokens) {
      body.max_tokens = input.maxTokens;
    }

    if (input.tools?.length) {
      body.tools = input.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }

    try {
      const { data } = await axios.post(
        `${this.baseUrl}/chat/completions`,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            // Optional OpenRouter Headers for routing or referer could be added here
            'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
            'X-Title': 'Gestor Delivery SaaS PRO',
          },
          timeout: 60_000,
        },
      );

      const choice = data.choices?.[0];
      const message = choice?.message;

      const toolCalls: AiToolCall[] = (message?.tool_calls || []).map(
        (tc: { id: string; function: { name: string; arguments: string } }) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: this.safeParseJson(tc.function.arguments),
        }),
      );

      let finishReason: AiCompletionResult['finishReason'] = 'stop';
      if (choice?.finish_reason === 'tool_calls') finishReason = 'tool_calls';
      else if (choice?.finish_reason === 'length') finishReason = 'length';
      else if (toolCalls.length > 0) finishReason = 'tool_calls';

      return {
        content: message?.content || null,
        toolCalls,
        finishReason,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`OpenRouter completion failed: ${message}`);
      let errorType: 'quota_exhausted' | 'model_unavailable' | 'unknown' = 'unknown';
      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;

      if (axios.isAxiosError(error) && error.response?.data) {
        this.logger.error(`OpenRouter error details: ${JSON.stringify(error.response.data)}`);
        const responseStr = JSON.stringify(error.response.data);
        const normalizedResponse = responseStr.toLowerCase();
        if (normalizedResponse.includes('insufficient_quota') || normalizedResponse.includes('429') || normalizedResponse.includes('rate_limit') || normalizedResponse.includes('quota exceeded')) {
          errorType = 'quota_exhausted';
        } else if (normalizedResponse.includes('model_not_found') || normalizedResponse.includes('does not exist') || normalizedResponse.includes('model unavailable')) {
          errorType = 'model_unavailable';
        }
      } else if (typeof message === 'string') {
        const normalizedMessage = message.toLowerCase();
        if (normalizedMessage.includes('insufficient_quota') || normalizedMessage.includes('429') || normalizedMessage.includes('rate_limit') || normalizedMessage.includes('quota exceeded')) {
          errorType = 'quota_exhausted';
        } else if (normalizedMessage.includes('model_not_found') || normalizedMessage.includes('does not exist') || normalizedMessage.includes('model unavailable')) {
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

  private safeParseJson(str: string): Record<string, unknown> {
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  }
}
