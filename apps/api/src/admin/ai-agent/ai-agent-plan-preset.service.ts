import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, Min, Max } from 'class-validator';
import { PrismaService } from '../../database/prisma.service';

export class UpdateAiAgentPlanPresetDto {
  @IsOptional()
  @IsBoolean()
  memoryAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  repeatLastOrderAllowed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(365)
  maxRetentionDays?: number;

  @IsOptional()
  @IsBoolean()
  advancedToolsAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  customPromptAllowed?: boolean;
}

@Injectable()
export class AiAgentPlanPresetService {
  private readonly logger = new Logger('AiAgentPlanPresetService');

  constructor(private readonly prisma: PrismaService) {}

  async listPresets() {
    return this.prisma.aiAgentPlanPreset.findMany({
      orderBy: { plan: 'asc' },
    });
  }

  async getPreset(plan: string) {
    return this.prisma.aiAgentPlanPreset.findUnique({ where: { plan } });
  }

  async upsertPreset(plan: string, dto: UpdateAiAgentPlanPresetDto) {
    const allowedPlans = ['basic', 'pro', 'premium'];
    if (!allowedPlans.includes(plan)) {
      throw new NotFoundException(`Plano inválido: ${plan}. Permitidos: ${allowedPlans.join(', ')}`);
    }

    const updateData: Partial<typeof dto> = {};
    if (dto.memoryAllowed !== undefined) updateData.memoryAllowed = dto.memoryAllowed;
    if (dto.repeatLastOrderAllowed !== undefined) updateData.repeatLastOrderAllowed = dto.repeatLastOrderAllowed;
    if (dto.maxRetentionDays !== undefined) updateData.maxRetentionDays = dto.maxRetentionDays;
    if (dto.advancedToolsAllowed !== undefined) updateData.advancedToolsAllowed = dto.advancedToolsAllowed;
    if (dto.customPromptAllowed !== undefined) updateData.customPromptAllowed = dto.customPromptAllowed;

    const result = await this.prisma.aiAgentPlanPreset.upsert({
      where: { plan },
      update: updateData,
      create: {
        plan,
        memoryAllowed: dto.memoryAllowed ?? false,
        repeatLastOrderAllowed: dto.repeatLastOrderAllowed ?? false,
        maxRetentionDays: dto.maxRetentionDays ?? 90,
        advancedToolsAllowed: dto.advancedToolsAllowed ?? false,
        customPromptAllowed: dto.customPromptAllowed ?? false,
      },
    });

    this.logger.log(`[AI_CONFIG] plan_preset_updated plan=${plan}`);
    return result;
  }

  /**
   * Retorna o preset correspondente ao plano de assinatura do tenant.
   * Se o tenant não tem assinatura ou o plano não tem preset, retorna null.
   */
  async getPresetForTenant(tenantId: string) {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      select: { plan: true },
    });

    if (!subscription?.plan) return null;

    const preset = await this.prisma.aiAgentPlanPreset.findUnique({
      where: { plan: subscription.plan },
    });

    return preset ?? null;
  }
}
