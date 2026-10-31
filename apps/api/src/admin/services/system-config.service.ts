import { Injectable, OnModuleInit, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, WhatsAppProviderType, AiProviderType } from '@prisma/client';
import { MediaLibraryService } from '../../upload/media-library.service';

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger('SystemConfigService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaLibrary: MediaLibraryService,
  ) {}

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
      include: {
        platformLogoMedia: {
          select: {
            id: true,
            publicUrl: true,
          },
        },
      },
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
      const previousConfig = await this.prisma.systemConfig.findUnique({
        where: { id: 'global' },
        select: { platformLogoMediaId: true },
      });
      const hadPlatformLogoChange = Object.prototype.hasOwnProperty.call(updateData, 'platformLogoMediaId');

      const result = await this.prisma.systemConfig.upsert({
        where: { id: 'global' },
        update: updateData as Prisma.SystemConfigUpdateInput,
        create: {
          id: 'global',
          ...(updateData as Prisma.SystemConfigCreateInput),
          defaultWhatsAppProvider: (updateData.defaultWhatsAppProvider as WhatsAppProviderType) || WhatsAppProviderType.evolution_go,
          defaultAiProvider: (updateData.defaultAiProvider as AiProviderType) || AiProviderType.openai,
        },
        include: {
          platformLogoMedia: {
            select: {
              id: true,
              publicUrl: true,
            },
          },
        },
      });

      if (hadPlatformLogoChange) {
        const previousLogoId = previousConfig?.platformLogoMediaId ?? null;
        const nextLogoId = result.platformLogoMediaId ?? null;
        if (previousLogoId && previousLogoId !== nextLogoId) {
          try {
            await this.mediaLibrary.deleteSystemAsset(previousLogoId);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Falha ao remover logo antiga (${previousLogoId}): ${message}`);
          }
        }
      }

      this.logger.log('[MODEL_DEBUG] saved model=' + (result.googleAiModel ?? 'undefined'));
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in SystemConfigService.updateConfig:', error);
      throw new InternalServerErrorException(`Database error: ${message}`);
    }
  }
}
