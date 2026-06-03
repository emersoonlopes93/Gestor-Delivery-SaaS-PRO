import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiFlowLogger } from '../../common/logging/ai-flow-logger';
import { AiProviderConfigService } from './ai-provider-config.service';

@Injectable()
export class AiConfigDiagnosticsService implements OnModuleInit {
  constructor(private readonly providerConfig: AiProviderConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.logStartupDiagnostics();
  }

  async logStartupDiagnostics(): Promise<void> {
    const providerResolution = await this.providerConfig.resolveDefaultProvider();
    const runtimeConfig = await this.providerConfig.resolveRuntimeConfig(
      providerResolution.provider,
      undefined,
      { providerSource: providerResolution.source },
    );

    AiFlowLogger.config('boot_ai_providers', {
      defaultProvider: runtimeConfig.provider,
      providerSource: runtimeConfig.providerSource,
      model: runtimeConfig.model,
      modelSource: runtimeConfig.modelSource,
      apiKeyPresent: runtimeConfig.apiKeyPresent,
      apiKeySource: runtimeConfig.apiKeySource,
      apiKeyFingerprint: runtimeConfig.apiKeyFingerprint,
      bullmqEnabled: process.env.BULLMQ_ENABLED === 'true',
      aiDebounceMode: 'in_memory_settimeout',
    });

    AiFlowLogger.config('boot_active_provider', {
      provider: runtimeConfig.provider,
      providerSource: runtimeConfig.providerSource,
      apiKeyPresent: runtimeConfig.apiKeyPresent,
      apiKeySource: runtimeConfig.apiKeySource,
      apiKeyFingerprint: runtimeConfig.apiKeyFingerprint,
      model: runtimeConfig.model,
      modelSource: runtimeConfig.modelSource,
    });
  }
}
