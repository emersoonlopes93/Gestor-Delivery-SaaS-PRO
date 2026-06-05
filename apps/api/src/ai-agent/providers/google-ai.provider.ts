import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AiProviderConfigService } from '../services/ai-provider-config.service';
import { normalizeToolResponse } from '../utils/normalize-tool-response';
import type {
  IAiProvider,
  AiCompletionInput,
  AiCompletionResult,
  AiMessage,
  AiToolCall,
} from '../interfaces/ai-provider.interface';

/** Modelos conhecidos com tier gratuito no Google AI Studio (lista estática de referência) */
export const GOOGLE_AI_FREE_MODELS = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (gratuito)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (gratuito)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (gratuito)' },
] as const;

/**
 * Provider de IA via Google AI Studio (Gemini API).
 *
 * Variáveis de ambiente:
 * - GOOGLE_AI_API_KEY (ou GEMINI_API_KEY)
 * - GOOGLE_AI_MODEL (fallback; default seguro: gemini-2.0-flash)
 * - GOOGLE_AI_BASE_URL (default: https://generativelanguage.googleapis.com/v1beta)
 */
@Injectable()
export class GoogleAiProvider implements IAiProvider {
  private readonly logger = new Logger('GoogleAiProvider');
  readonly providerType = 'google_ai' as const;

  constructor(private readonly providerConfig: AiProviderConfigService) {}

  private get baseUrl(): string {
    return (
      process.env.GOOGLE_AI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta'
    );
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
    this.logger.log(`[MODEL_DEBUG] runtime model=${model}`);

    if (!apiKey) {
      this.logger.error('Google AI provider is not configured: API key missing.');
      return {
        content: null,
        toolCalls: [],
        finishReason: 'error',
        error: {
          type: 'unknown',
          message: 'Google AI API key ausente. Configure no SaaS Admin ou ENV.',
        },
      };
    }

    const systemMessage = input.messages.find((m) => m.role === 'system');
    const sanitized = this.sanitizeGeminiHistory(input.messages);
    const contents = this.buildContents(sanitized);
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
      const statusCode = axios.isAxiosError(error) ? error.response?.status : undefined;

      if (axios.isAxiosError(error) && error.response?.data) {
        const errorData = error.response.data;
        this.logger.error(`Google AI error details: ${JSON.stringify(errorData)}`);
        const responseStr = JSON.stringify(errorData);
        const normalizedResponse = responseStr.toLowerCase();
        if (
          normalizedResponse.includes('no longer available') ||
          normalizedResponse.includes('not found') ||
          normalizedResponse.includes('model unavailable') ||
          normalizedResponse.includes('not supported for generatecontent')
        ) {
          errorType = 'model_unavailable';
          this.logger.error(`[AI_PROVIDER] model_unavailable provider=google_ai model=${model}`);
          this.logger.warn(`[AI_PROVIDER] list_models_recommended=true`);
        } else if (
          normalizedResponse.includes('429') ||
          normalizedResponse.includes('resource_exhausted') ||
          normalizedResponse.includes('quota exceeded')
        ) {
          errorType = 'quota_exhausted';
        }
      } else if (typeof message === 'string') {
        const normalizedMessage = message.toLowerCase();
        if (
          normalizedMessage.includes('no longer available') ||
          normalizedMessage.includes('not found') ||
          normalizedMessage.includes('model unavailable') ||
          normalizedMessage.includes('not supported for generatecontent')
        ) {
          errorType = 'model_unavailable';
          this.logger.error(`[AI_PROVIDER] model_unavailable provider=google_ai model=${model}`);
          this.logger.warn(`[AI_PROVIDER] list_models_recommended=true`);
        } else if (
          normalizedMessage.includes('429') ||
          normalizedMessage.includes('resource_exhausted') ||
          normalizedMessage.includes('quota exceeded')
        ) {
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
          statusCode,
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

  private sanitizeGeminiHistory(messages: AiMessage[]): AiMessage[] {
    const sanitized: AiMessage[] = [];
    const systemMessages = messages.filter((m) => m.role === 'system');
    const activeMessages = messages.filter((m) => m.role !== 'system');

    // Indexa as mensagens de retorno de ferramenta por ID de chamada
    const toolMessagesById = new Map<string, AiMessage>();
    for (const m of activeMessages) {
      if (m.role === 'tool' && m.toolCallId) {
        toolMessagesById.set(m.toolCallId, m);
      }
    }

    const placedToolMessageIds = new Set<string>();

    for (const msg of activeMessages) {
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        sanitized.push(msg);

        // Associa imediatamente as respostas para as ferramentas chamadas neste turno
        const responses: AiMessage[] = [];
        for (const tc of msg.toolCalls) {
          const toolMsg = toolMessagesById.get(tc.id);
          if (toolMsg) {
            responses.push(toolMsg);
            placedToolMessageIds.add(tc.id);
          } else {
            // Se faltar a resposta da ferramenta (por exemplo, interrupção ou crash intermediário),
            // injeta um retorno padrão de erro para manter a integridade dos turnos no Gemini.
            responses.push({
              role: 'tool',
              toolCallId: tc.id,
              content: JSON.stringify({ error: 'Function execution was interrupted or failed.' }),
            });
          }
        }

        sanitized.push(...responses);
        continue;
      }

      if (msg.role === 'tool') {
        // Ignora respostas de ferramentas soltas ou que já foram reposicionadas
        if (msg.toolCallId && placedToolMessageIds.has(msg.toolCallId)) {
          continue;
        }
        continue;
      }

      sanitized.push(msg);
    }

    return [...systemMessages, ...sanitized];
  }
}
