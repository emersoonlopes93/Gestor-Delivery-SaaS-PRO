import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../database/prisma.service';
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

  private cachedApiKey: { value: string; fetchedAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async getApiKey(): Promise<string> {
    const envKey = process.env.OPENAI_API_KEY;
    if (envKey && envKey.trim() !== '') return envKey.trim();

    const now = Date.now();
    if (this.cachedApiKey && now - this.cachedApiKey.fetchedAt < 60_000) {
      return this.cachedApiKey.value;
    }

    const systemConfig = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: { openaiApiKey: true },
    });

    const dbKey = systemConfig?.openaiApiKey?.trim() || '';
    this.cachedApiKey = { value: dbKey, fetchedAt: now };
    return dbKey;
  }

  private get model(): string {
    return process.env.OPENAI_MODEL || 'gpt-4o';
  }

  private get baseUrl(): string {
    return process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    return apiKey.trim() !== '';
  }

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const model = input.model || this.model;
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
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

      if (axios.isAxiosError(error) && error.response?.data) {
        this.logger.error(`OpenAI error details: ${JSON.stringify(error.response.data)}`);
        const responseStr = JSON.stringify(error.response.data);
        if (responseStr.includes('insufficient_quota') || responseStr.includes('429') || responseStr.includes('rate_limit')) {
          errorType = 'quota_exhausted';
        } else if (responseStr.includes('model_not_found') || responseStr.includes('does not exist')) {
          errorType = 'model_unavailable';
        }
      } else if (typeof message === 'string') {
        if (message.includes('insufficient_quota') || message.includes('429') || message.includes('rate_limit')) {
          errorType = 'quota_exhausted';
        } else if (message.includes('model_not_found') || message.includes('does not exist')) {
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
