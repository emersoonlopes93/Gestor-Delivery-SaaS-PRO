import { Injectable, Logger } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type AiConfigSource = 'database' | 'env' | 'tenant_config' | 'default' | 'request';

export interface AiProviderRuntimeConfig {
  provider: AiProviderType;
  providerSource: AiConfigSource;
  model: string;
  modelSource: AiConfigSource;
  apiKey: string;
  apiKeyPresent: boolean;
  apiKeySource: AiConfigSource | 'none';
  apiKeyFingerprint: string | null;
}

const DEFAULT_MODELS: Record<AiProviderType, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20240620',
  google_ai: 'gemini-2.0-flash',
};

@Injectable()
export class AiProviderConfigService {
  private readonly logger = new Logger('AiProviderConfigService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ordem oficial de prioridade em runtime:
   *
   * Provider/model:
   * 1. Tenant override ativo, quando existir no schema (hoje nao ha campos provider/model em AiAgentConfig)
   * 2. Config global do SaaS Admin em system_configs
   * 3. ENV
   * 4. Default seguro do codigo
   *
   * API key:
   * 1. Config global do SaaS Admin em system_configs
   * 2. ENV
   * 3. Erro claro se nenhuma key existir
   *
   * Tenant BYOK ainda nao existe no schema atual; quando for criado, deve entrar antes da key global
   * apenas para planos explicitamente autorizados.
   */
  async resolveRuntimeConfig(
    provider: AiProviderType,
    modelOverride?: string,
    options: { log?: boolean; providerSource?: AiConfigSource; modelOverrideSource?: AiConfigSource } = {},
  ): Promise<AiProviderRuntimeConfig> {
    const systemConfig = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: {
        openaiApiKey: true,
        anthropicApiKey: true,
        googleAiApiKey: true,
        openaiModel: true,
        anthropicModel: true,
        googleAiModel: true,
      },
    });

    const keyResolution = this.resolveApiKey(provider, systemConfig);
    const modelResolution = this.resolveModel(
      provider,
      systemConfig,
      modelOverride,
      options.modelOverrideSource,
    );

    const resolved: AiProviderRuntimeConfig = {
      provider,
      providerSource: options.providerSource ?? 'database',
      model: modelResolution.value,
      modelSource: modelResolution.source,
      apiKey: keyResolution.value,
      apiKeyPresent: keyResolution.value !== '',
      apiKeySource: keyResolution.source,
      apiKeyFingerprint: this.fingerprint(keyResolution.value),
    };

    if (options.log) {
      this.logger.log(
        `[AI_PROVIDER_CONFIG] provider=${resolved.provider} providerSource=${resolved.providerSource}`,
      );
      this.logger.log(
        `[AI_PROVIDER_CONFIG] model=${resolved.model} modelSource=${resolved.modelSource}`,
      );
      this.logger.log(
        `[AI_PROVIDER_CONFIG] apiKeyPresent=${resolved.apiKeyPresent} apiKeySource=${resolved.apiKeySource}`,
      );
      this.logger.log(
        `[AI_PROVIDER_CONFIG] apiKeyFingerprint=${resolved.apiKeyFingerprint ?? 'none'}`,
      );
    }

    return resolved;
  }

  async resolveDefaultProvider(): Promise<{ provider: AiProviderType; source: AiConfigSource }> {
    const systemConfig = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: { defaultAiProvider: true },
    });

    if (systemConfig?.defaultAiProvider) {
      return { provider: systemConfig.defaultAiProvider, source: 'database' };
    }

    return { provider: 'openai', source: 'default' };
  }

  getDefaultModel(provider: AiProviderType): string {
    return DEFAULT_MODELS[provider];
  }

  fingerprint(secret: string): string | null {
    const value = secret.trim();
    if (!value) return null;
    if (value.length <= 8) return `${value.slice(0, 4)}...`;
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private resolveApiKey(
    provider: AiProviderType,
    systemConfig: {
      openaiApiKey: string | null;
      anthropicApiKey: string | null;
      googleAiApiKey: string | null;
    } | null,
  ): { value: string; source: AiProviderRuntimeConfig['apiKeySource'] } {
    const dbKey = this.dbApiKey(provider, systemConfig);
    if (dbKey) return { value: dbKey, source: 'database' };

    const envKey = this.envApiKey(provider);
    if (envKey) return { value: envKey, source: 'env' };

    return { value: '', source: 'none' };
  }

  private resolveModel(
    provider: AiProviderType,
    systemConfig: {
      openaiModel: string | null;
      anthropicModel: string | null;
      googleAiModel: string | null;
    } | null,
    modelOverride?: string,
    modelOverrideSource: AiConfigSource = 'request',
  ): { value: string; source: AiConfigSource } {
    const requestedModel = modelOverride?.trim();
    if (requestedModel) return { value: requestedModel, source: modelOverrideSource };

    const dbModel = this.dbModel(provider, systemConfig);
    if (dbModel) return { value: dbModel, source: 'database' };

    const envModel = this.envModel(provider);
    if (envModel) return { value: envModel, source: 'env' };

    return { value: DEFAULT_MODELS[provider], source: 'default' };
  }

  private dbApiKey(
    provider: AiProviderType,
    systemConfig: {
      openaiApiKey: string | null;
      anthropicApiKey: string | null;
      googleAiApiKey: string | null;
    } | null,
  ): string {
    const value =
      provider === 'google_ai'
        ? systemConfig?.googleAiApiKey
        : provider === 'anthropic'
          ? systemConfig?.anthropicApiKey
          : systemConfig?.openaiApiKey;
    return value?.trim() ?? '';
  }

  private envApiKey(provider: AiProviderType): string {
    if (provider === 'google_ai') {
      return (
        process.env.GOOGLE_AI_API_KEY?.trim() ||
        process.env.GEMINI_API_KEY?.trim() ||
        ''
      );
    }

    if (provider === 'anthropic') {
      return process.env.ANTHROPIC_API_KEY?.trim() || '';
    }

    return process.env.OPENAI_API_KEY?.trim() || '';
  }

  private dbModel(
    provider: AiProviderType,
    systemConfig: {
      openaiModel: string | null;
      anthropicModel: string | null;
      googleAiModel: string | null;
    } | null,
  ): string {
    const value =
      provider === 'google_ai'
        ? systemConfig?.googleAiModel
        : provider === 'anthropic'
          ? systemConfig?.anthropicModel
          : systemConfig?.openaiModel;
    return value?.trim() ?? '';
  }

  private envModel(provider: AiProviderType): string {
    if (provider === 'google_ai') return process.env.GOOGLE_AI_MODEL?.trim() || '';
    if (provider === 'anthropic') return process.env.ANTHROPIC_MODEL?.trim() || '';
    return process.env.OPENAI_MODEL?.trim() || '';
  }
}
