import { Injectable, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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

  async updateConfig(data: any) {
    // Removemos campos que não devem ser atualizados manualmente
    const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...updateData } = data;

    try {
      return await this.prisma.systemConfig.upsert({
        where: { id: 'global' },
        update: updateData,
        create: {
          id: 'global',
          ...updateData,
          defaultWhatsAppProvider: updateData.defaultWhatsAppProvider || 'evolution_go',
          defaultAiProvider: updateData.defaultAiProvider || 'openai',
        },
      });
    } catch (error: any) {
      console.error('Error in SystemConfigService.updateConfig:', error);
      throw new InternalServerErrorException(`Database error: ${error.message}`);
    }
  }
}
