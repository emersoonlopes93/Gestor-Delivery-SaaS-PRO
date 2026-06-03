import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiProviderType } from '@prisma/client';
import { OpenAiProvider } from '../providers/openai.provider';
import { AnthropicProvider } from '../providers/anthropic.provider';
import { GoogleAiProvider } from '../providers/google-ai.provider';
import { IAiProvider } from '../interfaces/ai-provider.interface';
import { AiConfigSource, AiProviderConfigService } from './ai-provider-config.service';

@Injectable()
export class AiProviderRegistryService {
  private readonly logger = new Logger('AiProviderRegistryService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiProvider,
    private readonly anthropic: AnthropicProvider,
    private readonly googleAi: GoogleAiProvider,
    private readonly providerConfig: AiProviderConfigService,
  ) {}

  getProvider(type: AiProviderType): IAiProvider {
    switch (type) {
      case 'openai':
        return this.openai;
      case 'anthropic':
        return this.anthropic;
      case 'google_ai':
        return this.googleAi;
      default:
        return this.openai;
    }
  }

  async resolveProvider(tenantId: string): Promise<IAiProvider> {
    const resolved = await this.resolveProviderWithSource(tenantId);
    return resolved.provider;
  }

  async resolveProviderWithSource(
    tenantId: string,
  ): Promise<{ provider: IAiProvider; source: AiConfigSource }> {
    await this.prisma.aiAgentConfig.findUnique({
      where: { tenantId },
      select: { tenantId: true },
    });

    // Tenant provider/model override ainda nao existe em AiAgentConfig.
    // Quando existir, ele deve entrar aqui antes da config global.
    const resolved = await this.providerConfig.resolveDefaultProvider();
    this.logger.log(
      `[AI_PROVIDER_CONFIG] provider=${resolved.provider} providerSource=${resolved.source}`,
    );

    return {
      provider: this.getProvider(resolved.provider),
      source: resolved.source,
    };
  }
}
