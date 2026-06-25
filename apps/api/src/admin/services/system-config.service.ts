import { Injectable, OnModuleInit, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, WhatsAppProviderType, AiProviderType } from '@prisma/client';

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger('SystemConfigService');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Garantir que existe o registro global
    await this.prisma.systemConfig.upsert({
      where: { id: 'global' },
      create: {
        id: 'global',
        appName: 'PedeHub',
        defaultWhatsAppProvider: WhatsAppProviderType.evolution_go,
        defaultAiProvider: AiProviderType.openai,
      },
      update: {},
    });
  }

  async getConfig() {
    const config = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
    });
    this.logger.log(`[MODEL_DEBUG] loaded model=${config?.googleAiModel ?? 'undefined'}`);
    return config;
  }

  async updateConfig(data: Record<string, unknown>) {
    const model = data['googleAiModel'];
    if (model !== undefined) {
      this.logger.log('[MODEL_DEBUG] saving model=' + model);
    }

    // Removemos campos que não devem ser atualizados manualmente
    const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...updateData } = data;
    if (typeof updateData.appName === 'string') {
      updateData.appName = updateData.appName.trim() || 'PedeHub';
    }

    try {
      const result = await this.prisma.systemConfig.upsert({
        where: { id: 'global' },
        update: updateData as Prisma.SystemConfigUpdateInput,
        create: {
          id: 'global',
          ...(updateData as Prisma.SystemConfigCreateInput),
          defaultWhatsAppProvider: (updateData.defaultWhatsAppProvider as WhatsAppProviderType) || WhatsAppProviderType.evolution_go,
          defaultAiProvider: (updateData.defaultAiProvider as AiProviderType) || AiProviderType.openai,
        },
      });
      this.logger.log('[MODEL_DEBUG] saved model=' + (result.googleAiModel ?? 'undefined'));
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in SystemConfigService.updateConfig:', error);
      throw new InternalServerErrorException(`Database error: ${message}`);
    }
  }
}
