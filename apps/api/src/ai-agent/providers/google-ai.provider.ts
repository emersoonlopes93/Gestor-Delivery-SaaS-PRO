import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../database/prisma.service';
import { normalizeToolResponse } from '../utils/normalize-tool-response';
import type {
  IAiProvider,
  AiCompletionInput,
  AiCompletionResult,
  AiMessage,
  AiToolCall,
} from '../interfaces/ai-provider.interface';

/** Modelos com tier gratuito no Google AI Studio */
export const GOOGLE_AI_FREE_MODELS = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (gratuito)' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (gratuito)' },
  { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B (gratuito)' },
] as const;

const DEFAULT_GOOGLE_AI_MODEL = 'gemini-2.0-flash';

/**
 * Provider de IA via Google AI Studio (Gemini API).
 *
 * Variáveis de ambiente:
 * - GOOGLE_AI_API_KEY (ou GEMINI_API_KEY)
 * - GOOGLE_AI_MODEL (default: gemini-2.0-flash)
 * - GOOGLE_AI_BASE_URL (default: https://generativelanguage.googleapis.com/v1beta)
 */
@Injectable()
export class GoogleAiProvider implements IAiProvider {
  private readonly logger = new Logger('GoogleAiProvider');
  readonly providerType = 'google_ai' as const;

  private cachedConfig: {
    apiKey: string;
    model: string;
    fetchedAt: number;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async getConfig(): Promise<{ apiKey: string; model: string }> {
    const envKey =
      process.env.GOOGLE_AI_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      '';
    const envModel = process.env.GOOGLE_AI_MODEL?.trim();

    if (envKey) {
      return {
        apiKey: envKey,
        model: envModel || DEFAULT_GOOGLE_AI_MODEL,
      };
    }

    const now = Date.now();
    if (this.cachedConfig && now - this.cachedConfig.fetchedAt < 60_000) {
      return {
        apiKey: this.cachedConfig.apiKey,
        model: this.cachedConfig.model,
      };
    }

    const systemConfig = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: { googleAiApiKey: true, googleAiModel: true },
    });

    const apiKey = systemConfig?.googleAiApiKey?.trim() || '';
    const model =
      systemConfig?.googleAiModel?.trim() || envModel || DEFAULT_GOOGLE_AI_MODEL;

    this.cachedConfig = { apiKey, model, fetchedAt: now };
    return { apiKey, model };
  }

  private get baseUrl(): string {
    return (
      process.env.GOOGLE_AI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta'
    );
  }

  async isAvailable(): Promise<boolean> {
    const { apiKey } = await this.getConfig();
    return apiKey !== '';
  }

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const { apiKey, model: configModel } = await this.getConfig();
    const model = input.model || configModel;

    if (!apiKey) {
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
      };
    }

    const systemMessage = input.messages.find((m) => m.role === 'system');
    const contents = this.buildContents(input.messages);
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: input.temperature ?? 0.7,
        ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
      },
    };

    if (systemMessage?.content) {
      body.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }

    if (input.tools?.length) {
      body.tools = [
        {
          functionDeclarations: input.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
      body.toolConfig = {
        functionCallingConfig: { mode: 'AUTO' },
      };
    }

    try {
      const { data } = await axios.post(
        `${this.baseUrl}/models/${model}:generateContent`,
        body,
        {
          params: { key: apiKey },
          headers: { 'Content-Type': 'application/json' },
          timeout: 60_000,
        },
      );

      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      const textParts = parts.filter(
        (p: { text?: string }) => typeof p.text === 'string',
      );
      const functionParts = parts.filter(
        (p: { functionCall?: { name: string; args?: Record<string, unknown>; id?: string } }) =>
          !!p.functionCall,
      );

      const toolCalls: AiToolCall[] = functionParts.map(
        (
          p: {
            functionCall: {
              name: string;
              args?: Record<string, unknown>;
              id?: string;
            };
          },
          index: number,
        ) => ({
          id:
            p.functionCall.id ||
            `gemini_${p.functionCall.name}_${index}`,
          name: p.functionCall.name,
          arguments: p.functionCall.args || {},
        }),
      );

      const textContent =
        textParts.map((p: { text: string }) => p.text).join('') || null;

      let finishReason: AiCompletionResult['finishReason'] = 'stop';
      const rawReason = candidate?.finishReason as string | undefined;
      if (toolCalls.length > 0) finishReason = 'tool_calls';
      else if (rawReason === 'MAX_TOKENS') finishReason = 'length';

      const usageMeta = data.usageMetadata;
      return {
        content: textContent,
        toolCalls,
        finishReason,
        usage: usageMeta
          ? {
              promptTokens: usageMeta.promptTokenCount ?? 0,
              completionTokens: usageMeta.candidatesTokenCount ?? 0,
              totalTokens: usageMeta.totalTokenCount ?? 0,
            }
          : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Google AI completion failed: ${message}`);
      let errorType: 'quota_exhausted' | 'model_unavailable' | 'unknown' = 'unknown';

      if (axios.isAxiosError(error) && error.response?.data) {
        const errorData = error.response.data;
        this.logger.error(`Google AI error details: ${JSON.stringify(errorData)}`);
        const responseStr = JSON.stringify(errorData);
        if (responseStr.includes('no longer available') || responseStr.includes('not found')) {
          errorType = 'model_unavailable';
          this.logger.error(`[AI_FLOW_ERROR] step=llm_model_unavailable model=${model}`);
        } else if (responseStr.includes('429') || responseStr.includes('RESOURCE_EXHAUSTED') || responseStr.includes('Quota exceeded')) {
          errorType = 'quota_exhausted';
        }
      } else if (typeof message === 'string') {
        if (message.includes('no longer available') || message.includes('not found')) {
          errorType = 'model_unavailable';
          this.logger.error(`[AI_FLOW_ERROR] step=llm_model_unavailable model=${model}`);
        } else if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('Quota exceeded')) {
          errorType = 'quota_exhausted';
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

  private buildContents(
    messages: AiMessage[],
  ): Array<{ role: string; parts: unknown[] }> {
    const toolNameById = new Map<string, string>();

    for (const m of messages) {
      if (m.role === 'assistant' && m.toolCalls?.length) {
        for (const tc of m.toolCalls) {
          toolNameById.set(tc.id, tc.name);
        }
      }
    }

    const contents: Array<{ role: string; parts: unknown[] }> = [];

    for (const m of messages) {
      if (m.role === 'system') continue;

      if (m.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: m.content }],
        });
        continue;
      }

      if (m.role === 'assistant') {
        const parts: unknown[] = [];
        if (m.content) {
          parts.push({ text: m.content });
        }
        if (m.toolCalls?.length) {
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: {
                id: tc.id,
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
        continue;
      }

      if (m.role === 'tool') {
        const toolName =
          (m.toolCallId && toolNameById.get(m.toolCallId)) || 'unknown_tool';
        let parsed: unknown;
        try {
          parsed = JSON.parse(m.content);
        } catch {
          parsed = m.content;
        }

        const responsePayload = normalizeToolResponse(parsed);

        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: m.toolCallId,
                name: toolName,
                response: responsePayload,
              },
            },
          ],
        });
      }
    }

    return contents;
  }
}
