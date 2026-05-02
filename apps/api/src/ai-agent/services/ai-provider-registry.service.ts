import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiProviderType } from '@prisma/client';
import { OpenAiProvider } from '../providers/openai.provider';
import { AnthropicProvider } from '../providers/anthropic.provider';
import { IAiProvider } from '../interfaces/ai-provider.interface';

@Injectable()
export class AiProviderRegistryService {
  private readonly logger = new Logger('AiProviderRegistryService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiProvider,
    private readonly anthropic: AnthropicProvider,
  ) {}

  /**
   * Retorna o provider solicitado
   */
  getProvider(type: AiProviderType): IAiProvider {
    switch (type) {
      case 'openai':
        return this.openai;
      case 'anthropic':
        return this.anthropic;
      default:
        return this.openai;
    }
  }

  /**
   * Resolve qual provider usar baseado no tenant e nas configs globais
   */
  async resolveProvider(tenantId: string): Promise<IAiProvider> {
    // 1. Verificar se o tenant tem um override específico na config de agente
    const agentConfig = await this.prisma.aiAgentConfig.findUnique({
      where: { tenantId },
      select: { tenantId: true } // temporário até adicionar campo aiProvider no modelo
    });

    // TODO: quando o campo aiProvider for adicionado ao AiAgentConfig, usar:
    // if (agentConfig?.aiProvider) { return this.getProvider(agentConfig.aiProvider as AiProviderType); }

    // 2. Senão, buscar o default global do SystemConfig
    const systemConfig = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: { defaultAiProvider: true }
    });

    return this.getProvider(systemConfig?.defaultAiProvider || 'openai');
  }
}
