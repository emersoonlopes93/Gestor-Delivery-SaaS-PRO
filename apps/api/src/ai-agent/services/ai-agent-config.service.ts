import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { 
  IsBoolean, 
  IsString, 
  IsOptional, 
  IsNumber, 
  IsEnum, 
  Min, 
  Max 
} from 'class-validator';

export class UpdateAiAgentConfigDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsString()
  greetingMessage?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  customInstructions?: string;

  @IsOptional()
  @IsString()
  operatingMode?: string;

  @IsOptional()
  @IsString()
  handoffPolicy?: string;

  @IsOptional()
  @IsString()
  fallbackMessage?: string;

  @IsOptional()
  @IsNumber()
  maxRetries?: number;

  @IsOptional()
  @IsNumber()
  sessionTimeoutMin?: number;

  @IsOptional()
  @IsNumber()
  dailyMessageLimit?: number;

  @IsOptional()
  @IsNumber()
  customerCooldownMin?: number;

  @IsOptional()
  @IsBoolean()
  simulateTyping?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(10000)
  debounceMs?: number;
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
      include: {
        tenant: {
          select: { name: true }
        }
      }
    });

    if (!config) {
      config = await this.prisma.aiAgentConfig.create({
        data: {
          tenantId,
          isEnabled: false,
          agentName: 'Assistente',
          tone: 'friendly',
          operatingMode: 'always',
          handoffPolicy: 'on_request',
          maxRetries: 3,
          sessionTimeoutMin: 120,
          dailyMessageLimit: 1000,
          customerCooldownMin: 5,
          simulateTyping: true,
          debounceMs: 1000,
          greetingMessage: 'Olá! Sou o assistente virtual da loja. Como posso ajudar?',
          fallbackMessage: 'Desculpe, não consegui entender. Quer falar com um atendente?',
          customInstructions: 'Seja sempre conciso. Responda em português (BR).',
        },
        include: {
          tenant: {
            select: { name: true }
          }
        }
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

    // Filtra apenas os campos que podem ser atualizados
    const allowedFields = {
      isEnabled: dto.isEnabled,
      agentName: dto.agentName,
      greetingMessage: dto.greetingMessage,
      tone: dto.tone,
      customInstructions: dto.customInstructions,
      operatingMode: dto.operatingMode,
      handoffPolicy: dto.handoffPolicy,
      fallbackMessage: dto.fallbackMessage,
      maxRetries: dto.maxRetries,
      sessionTimeoutMin: dto.sessionTimeoutMin,
      dailyMessageLimit: dto.dailyMessageLimit,
      customerCooldownMin: dto.customerCooldownMin,
      simulateTyping: dto.simulateTyping,
      debounceMs: dto.debounceMs,
    };

    // Remove campos apenas se forem undefined (PATCH semântico)
    const cleanData = Object.fromEntries(
      Object.entries(allowedFields).filter(([_, value]) => value !== undefined)
    );

    const updated = await this.prisma.aiAgentConfig.update({
      where: { tenantId },
      data: cleanData,
    });

    this.logger.log(`AI Config updated for tenant ${tenantId}`);
    return updated;
  }
}
