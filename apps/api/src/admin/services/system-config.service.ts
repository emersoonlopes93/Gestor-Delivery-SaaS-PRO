import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppProviderType, AiProviderType } from '@prisma/client';

@Injectable()
export class SystemConfigService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Garantir que existe o registro global
    await this.prisma.systemConfig.upsert({
      where: { id: 'global' },
      create: {
        id: 'global',
        defaultWhatsAppProvider: 'evolution_go',
        defaultAiProvider: 'openai',
      },
      update: {},
    });
  }

  async getConfig() {
    return this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
    });
  }

  async updateConfig(data: {
    defaultWhatsAppProvider?: WhatsAppProviderType;
    defaultAiProvider?: AiProviderType;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    metaAccessToken?: string;
    metaAppSecret?: string;
  }) {
    return this.prisma.systemConfig.update({
      where: { id: 'global' },
      data,
    });
  }
}
