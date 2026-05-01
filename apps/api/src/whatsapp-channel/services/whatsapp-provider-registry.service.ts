import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppProviderType } from '@prisma/client';
import { EvolutionGoProvider } from '../providers/evolution-go.provider';
import { MetaCloudProvider } from '../providers/meta-cloud.provider';
import { IWhatsAppProvider } from '../interfaces/whatsapp-provider.interface';

@Injectable()
export class WhatsAppProviderRegistryService {
  private readonly logger = new Logger('WhatsAppProviderRegistryService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolutionGo: EvolutionGoProvider,
    private readonly metaCloud: MetaCloudProvider,
  ) {}

  /**
   * Retorna o provider solicitado
   */
  getProvider(type: WhatsAppProviderType): IWhatsAppProvider {
    switch (type) {
      case 'evolution_go':
        return this.evolutionGo;
      case 'meta_cloud':
        return this.metaCloud;
      default:
        return this.evolutionGo;
    }
  }

  /**
   * Resolve qual provider usar baseado no tenant e nas configs globais
   */
  async resolveProvider(tenantId: string): Promise<IWhatsAppProvider> {
    // 1. Verificar se o tenant tem uma instância configurada com um tipo específico
    const instance = await this.prisma.whatsAppInstance.findUnique({
      where: { tenantId },
      select: { providerType: true }
    });

    if (instance?.providerType) {
      return this.getProvider(instance.providerType);
    }

    // 2. Senão, buscar o default global do SystemConfig
    const systemConfig = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: { defaultWhatsAppProvider: true }
    });

    return this.getProvider(systemConfig?.defaultWhatsAppProvider || 'evolution_go');
  }
}
