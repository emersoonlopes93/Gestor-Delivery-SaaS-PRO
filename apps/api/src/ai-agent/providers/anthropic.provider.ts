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

  private cachedApiKey: { value: string; fetchedAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async getApiKey(): Promise<string> {
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey && envKey.trim() !== '') return envKey.trim();

    const now = Date.now();
    if (this.cachedApiKey && now - this.cachedApiKey.fetchedAt < 60_000) {
      return this.cachedApiKey.value;
    }

    const systemConfig = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: { anthropicApiKey: true },
    });

    const dbKey = systemConfig?.anthropicApiKey?.trim() || '';
    this.cachedApiKey = { value: dbKey, fetchedAt: now };
    return dbKey;
  }

  private get model(): string {
    return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20240620';
  }

  private get anthropicVersion(): string {
    return process.env.ANTHROPIC_VERSION || '2023-06-01';
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
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
      };
    }
  }
}
