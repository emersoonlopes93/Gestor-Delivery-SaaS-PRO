/**
 * Interface de abstração para providers de IA (LLM).
 * Implementações: OpenAiProvider, AnthropicProvider, GoogleAiProvider
 *
 * O provider de IA é responsável apenas pela comunicação com o LLM.
 * As tools e o contexto de negócio são injetados externamente.
 */

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string; // para role 'tool'
  toolCalls?: AiToolCall[]; // para role 'assistant' com tool calls
}

export interface AiCompletionInput {
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
  providerSource?: 'database' | 'env' | 'tenant_config' | 'default' | 'request';
  modelSource?: 'database' | 'env' | 'tenant_config' | 'default' | 'request';
}

export interface AiCompletionResult {
  content: string | null;
  toolCalls: AiToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: {
    type: 'quota_exhausted' | 'model_unavailable' | 'unknown';
    message: string;
    statusCode?: number;
  };
}

export const AI_PROVIDER = 'AI_PROVIDER';

export interface IAiProvider {
  /**
   * Identifica o tipo do provider
   */
  readonly providerType: 'openai' | 'anthropic' | 'google_ai';

  /**
   * Envia mensagens para o LLM e recebe resposta
   * Suporta function calling nativo
   */
  complete(input: AiCompletionInput): Promise<AiCompletionResult>;

  /**
   * Verifica se o provider está configurado e funcional
   */
  isAvailable(): Promise<boolean>;
}
