import { Injectable, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, WhatsAppProviderType, AiProviderType } from '@prisma/client';

@Injectable()
export class SystemConfigService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Garantir que existe o registro global
    await this.prisma.systemConfig.upsert({
      where: { id: 'global' },
      create: {
        id: 'global',
        defaultWhatsAppProvider: WhatsAppProviderType.evolution_go,
        defaultAiProvider: AiProviderType.openai,
      },
      update: {},
    });
  }

  async getConfig() {
    return this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
    });
  }

  async updateConfig(data: Record<string, unknown>) {
    // Removemos campos que não devem ser atualizados manualmente
    const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...updateData } = data;

    try {
      return await this.prisma.systemConfig.upsert({
        where: { id: 'global' },
        update: updateData as Prisma.SystemConfigUpdateInput,
        create: {
          id: 'global',
          ...(updateData as Prisma.SystemConfigCreateInput),
          defaultWhatsAppProvider: (updateData.defaultWhatsAppProvider as WhatsAppProviderType) || WhatsAppProviderType.evolution_go,
          defaultAiProvider: (updateData.defaultAiProvider as AiProviderType) || AiProviderType.openai,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in SystemConfigService.updateConfig:', error);
      throw new InternalServerErrorException(`Database error: ${message}`);
    }
  }
}
