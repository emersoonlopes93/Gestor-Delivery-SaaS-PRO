import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiFlowLogger } from '../../common/logging/ai-flow-logger';
import { AiProviderType } from '@prisma/client';

@Injectable()
export class AiConfigDiagnosticsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.logStartupDiagnostics();
  }

  async logStartupDiagnostics(): Promise<void> {
    const systemConfig = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: {
        defaultAiProvider: true,
        openaiApiKey: true,
        anthropicApiKey: true,
        googleAiApiKey: true,
        googleAiModel: true,
      },
    });

    const defaultProvider = systemConfig?.defaultAiProvider ?? 'openai';

    AiFlowLogger.config('boot_ai_providers', {
      defaultProvider,
      openaiEnvPresent: this.envPresent('OPENAI_API_KEY'),
      anthropicEnvPresent: this.envPresent('ANTHROPIC_API_KEY'),
      googleAiEnvPresent:
        this.envPresent('GOOGLE_AI_API_KEY') || this.envPresent('GEMINI_API_KEY'),
      openaiDbPresent: Boolean(systemConfig?.openaiApiKey?.trim()),
      anthropicDbPresent: Boolean(systemConfig?.anthropicApiKey?.trim()),
      googleAiDbPresent: Boolean(systemConfig?.googleAiApiKey?.trim()),
      googleAiModel: systemConfig?.googleAiModel ?? process.env.GOOGLE_AI_MODEL ?? 'gemini-2.0-flash-lite',
      openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o',
      anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20240620',
      bullmqEnabled: process.env.BULLMQ_ENABLED === 'true',
      aiDebounceMode: 'in_memory_settimeout',
    });

    const activeProvider = defaultProvider as AiProviderType;
    const apiKeyPresent = await this.resolveApiKeyPresent(activeProvider, systemConfig);
    AiFlowLogger.config('boot_active_provider', {
      provider: activeProvider,
      apiKeyPresent,
      model: this.resolveModel(activeProvider, systemConfig),
    });
  }

  private envPresent(name: string): boolean {
    const value = process.env[name];
    return typeof value === 'string' && value.trim() !== '';
  }

  private resolveModel(
    provider: AiProviderType,
    systemConfig: {
      googleAiModel: string | null;
    } | null,
  ): string {
    switch (provider) {
      case 'anthropic':
        return process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20240620';
      case 'google_ai':
        return systemConfig?.googleAiModel ?? process.env.GOOGLE_AI_MODEL ?? 'gemini-2.0-flash-lite';
      default:
        return process.env.OPENAI_MODEL ?? 'gpt-4o';
    }
  }

  private async resolveApiKeyPresent(
    provider: AiProviderType,
    systemConfig: {
      openaiApiKey: string | null;
      anthropicApiKey: string | null;
      googleAiApiKey: string | null;
    } | null,
  ): Promise<boolean> {
    switch (provider) {
      case 'anthropic':
        return (
          this.envPresent('ANTHROPIC_API_KEY') ||
          Boolean(systemConfig?.anthropicApiKey?.trim())
        );
      case 'google_ai':
        return (
          this.envPresent('GOOGLE_AI_API_KEY') ||
          this.envPresent('GEMINI_API_KEY') ||
          Boolean(systemConfig?.googleAiApiKey?.trim())
        );
      default:
        return (
          this.envPresent('OPENAI_API_KEY') ||
          Boolean(systemConfig?.openaiApiKey?.trim())
        );
    }
  }
}
