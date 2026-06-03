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
 * Provider de IA via OpenAI API (GPT-4o).
 *
 * Variáveis de ambiente:
 * - OPENAI_API_KEY
 * - OPENAI_MODEL (default: gpt-4o)
 * - OPENAI_BASE_URL (default: https://api.openai.com/v1)
 */
@Injectable()
export class OpenAiProvider implements IAiProvider {
  private readonly logger = new Logger('OpenAiProvider');
  readonly providerType = 'openai' as const;

  constructor(private readonly providerConfig: AiProviderConfigService) {}

  private get baseUrl(): string {
    return process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

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
      this.logger.error('OpenAI provider is not configured: API key missing.');
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
        error: {
          type: 'unknown',
          message: 'OpenAI API key ausente. Configure no SaaS Admin ou ENV.',
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
      this.logger.error(`OpenAI completion failed: ${message}`);
      let errorType: 'quota_exhausted' | 'model_unavailable' | 'unknown' = 'unknown';
      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;

      if (axios.isAxiosError(error) && error.response?.data) {
        this.logger.error(`OpenAI error details: ${JSON.stringify(error.response.data)}`);
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
