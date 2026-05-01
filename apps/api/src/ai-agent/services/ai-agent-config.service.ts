import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiProviderType } from '@prisma/client';

export interface UpdateAiAgentConfigDto {
  isEnabled?: boolean;
  aiProvider?: AiProviderType;
  greetingMessage?: string | null;
  systemPrompt?: string | null;
  tone?: string;
  operatingMode?: string;
  handoffPolicy?: string;
  fallbackMessage?: string | null;
  maxRetries?: number;
  sessionTimeoutMin?: number;
  dailyMessageLimit?: number;
  customerCooldownMin?: number;
}

@Injectable()
export class AiAgentConfigService {
  private readonly logger = new Logger('AiAgentConfigService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtém a configuração de IA do tenant, criando uma default se não existir.
   */
  async getConfig(tenantId: string) {
    let config = await this.prisma.aiAgentConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await this.prisma.aiAgentConfig.create({
        data: {
          tenantId,
          isEnabled: false,
          aiProvider: 'openai',
          tone: 'friendly',
          operatingMode: 'always',
          handoffPolicy: 'on_request',
          maxRetries: 3,
          sessionTimeoutMin: 120,
          dailyMessageLimit: 1000,
          customerCooldownMin: 5,
          greetingMessage: 'Olá! Sou o assistente virtual da loja. Como posso ajudar?',
          fallbackMessage: 'Desculpe, não consegui entender. Quer falar com um atendente?',
          systemPrompt: `Você é um assistente virtual inteligente e amigável de delivery.
Sua missão é ajudar o cliente a fazer o pedido, consultar o cardápio e tirar dúvidas.
Seja sempre conciso. Responda em português (BR).`,
        },
      });
      this.logger.log(`Default AI Config created for tenant ${tenantId}`);
    }

    return config;
  }

  /**
   * Atualiza a configuração de IA do tenant.
   */
  async updateConfig(tenantId: string, dto: UpdateAiAgentConfigDto) {
    // Garante que existe antes de atualizar
    await this.getConfig(tenantId);

    const updated = await this.prisma.aiAgentConfig.update({
      where: { tenantId },
      data: dto,
    });

    this.logger.log(`AI Config updated for tenant ${tenantId}`);
    return updated;
  }
}
