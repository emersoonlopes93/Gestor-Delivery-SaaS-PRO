import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
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

  private get apiKey(): string {
    return process.env.OPENAI_API_KEY || '';
  }

  private get model(): string {
    return process.env.OPENAI_MODEL || 'gpt-4o';
  }

  private get baseUrl(): string {
    return process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const model = input.model || this.model;

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
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 60_000,
        },
      );

      const choice = data.choices?.[0];
      const message = choice?.message;

      const toolCalls: AiToolCall[] = (message?.tool_calls || []).map(
        (tc: any) => ({
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
    } catch (error: any) {
      this.logger.error(`OpenAI completion failed: ${error.message}`);
      const errorData = error.response?.data;
      if (errorData) {
        this.logger.error(`OpenAI error details: ${JSON.stringify(errorData)}`);
      }
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
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
