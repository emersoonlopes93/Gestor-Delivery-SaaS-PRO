import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  IsBoolean,
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
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
  @Min(10000)
  @Max(30000)
  debounceMs?: number;

  @IsOptional()
  @IsBoolean()
  memoryEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  rememberCustomerName?: boolean;

  @IsOptional()
  @IsBoolean()
  rememberAddresses?: boolean;

  @IsOptional()
  @IsBoolean()
  rememberLastOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  rememberPreferences?: boolean;

  @IsOptional()
  @IsBoolean()
  allowRepeatLastOrder?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(7)
  @Max(365)
  memoryRetentionDays?: number;

  /** Quando true o tenant herda config global; quando false usa override próprio */
  @IsOptional()
  @IsBoolean()
  useGlobalDefaults?: boolean;
}

/** Configuração efetiva resolvida pelas 3 camadas: global → plano → override */
export interface EffectiveAiAgentConfig {
  tenantId: string;
  useGlobalDefaults: boolean;
  isEnabled: boolean;
  agentName: string;
  greetingMessage: string | null;
  tone: string;
  customInstructions: string | null;
  operatingMode: string;
  handoffPolicy: string;
  fallbackMessage: string | null;
  maxRetries: number;
  sessionTimeoutMin: number;
  dailyMessageLimit: number;
  customerCooldownMin: number;
  simulateTyping: boolean;
  debounceMs: number;
  memoryEnabled: boolean;
  rememberCustomerName: boolean;
  rememberAddresses: boolean;
  rememberLastOrder: boolean;
  rememberPreferences: boolean;
  allowRepeatLastOrder: boolean;
  memoryRetentionDays: number;
  tenant: { name: string };
  /** Metadados de resolução para diagnóstico */
  _resolution: {
    source: 'global_only' | 'plan_override' | 'tenant_override';
    planPreset: string | null;
  };
}

@Injectable()
export class AiAgentConfigService {
  private readonly logger = new Logger('AiAgentConfigService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtém a configuração de IA do tenant, criando uma default se não existir.
   * Para compatibilidade legada — retorna o registro raw do banco.
   */
  async getConfig(tenantId: string) {
    let config = await this.prisma.aiAgentConfig.findUnique({
      where: { tenantId },
      include: {
        tenant: {
          select: { name: true },
        },
      },
    });

    if (!config) {
      config = await this.prisma.aiAgentConfig.create({
        data: {
          tenantId,
          useGlobalDefaults: true,
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
          debounceMs: 10000,
          greetingMessage: 'Olá! Sou o assistente virtual da loja. Como posso ajudar?',
          fallbackMessage: 'Desculpe, não consegui entender. Quer falar com um atendente?',
          customInstructions: 'Seja sempre conciso. Responda em português (BR).',
          memoryEnabled: false,
          rememberCustomerName: false,
          rememberAddresses: false,
          rememberLastOrder: false,
          rememberPreferences: false,
          allowRepeatLastOrder: false,
          memoryRetentionDays: 180,
        },
        include: {
          tenant: {
            select: { name: true },
          },
        },
      });
      this.logger.log(`Default AI Config created for tenant ${tenantId}`);
    }

    return config;
  }

  /**
   * Resolve a configuração efetiva do Agente IA combinando:
   * 1. Config global (SystemConfig)
   * 2. Preset do plano (AiAgentPlanPreset via TenantSubscription)
   * 3. Override por tenant (AiAgentConfig)
   *
   * Logs:
   * [AI_CONFIG] global_loaded
   * [AI_CONFIG] plan_loaded
   * [AI_CONFIG] tenant_override_loaded
   * [AI_CONFIG] effective_config_resolved
   */
  async getEffectiveAiAgentConfig(tenantId: string): Promise<EffectiveAiAgentConfig> {
    // --- 1. Config Global ---
    const globalCfg = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
    });
    this.logger.log(`[AI_CONFIG] global_loaded tenantId=${tenantId}`);

    const globalDefaults = {
      agentName: globalCfg?.aiDefaultAgentName ?? 'Assistente',
      tone: globalCfg?.aiDefaultTone ?? 'friendly',
      memoryEnabled: globalCfg?.aiMemoryEnabled ?? false,
      rememberCustomerName: globalCfg?.aiRememberCustomerName ?? false,
      rememberAddresses: globalCfg?.aiRememberAddresses ?? false,
      rememberLastOrder: globalCfg?.aiRememberLastOrder ?? false,
      rememberPreferences: globalCfg?.aiRememberPreferences ?? false,
      allowRepeatLastOrder: globalCfg?.aiAllowRepeatLastOrder ?? false,
      memoryRetentionDays: globalCfg?.aiMemoryRetentionDays ?? 180,
      debounceMs: globalCfg?.aiDebounceMs ?? 10000,
      simulateTyping: globalCfg?.aiSimulateTyping ?? true,
    };

    // --- 2. Preset do Plano ---
    let planPresetName: string | null = null;
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      select: { plan: true },
    });

    let planOverrides: Partial<typeof globalDefaults> = {};

    if (subscription?.plan) {
      const preset = await this.prisma.aiAgentPlanPreset.findUnique({
        where: { plan: subscription.plan },
      });
      if (preset) {
        planPresetName = subscription.plan;
        // O preset do plano restringe o que é permitido, não substitui direto
        if (!preset.memoryAllowed) {
          planOverrides.memoryEnabled = false;
          planOverrides.rememberCustomerName = false;
          planOverrides.rememberAddresses = false;
          planOverrides.rememberLastOrder = false;
          planOverrides.rememberPreferences = false;
          planOverrides.allowRepeatLastOrder = false;
        }
        if (!preset.repeatLastOrderAllowed) {
          planOverrides.allowRepeatLastOrder = false;
        }
        if (preset.maxRetentionDays < globalDefaults.memoryRetentionDays) {
          planOverrides.memoryRetentionDays = preset.maxRetentionDays;
        }
        this.logger.log(
          `[AI_CONFIG] plan_loaded plan=${planPresetName} memoryAllowed=${preset.memoryAllowed}`,
        );
      } else {
        this.logger.log(`[AI_CONFIG] plan_loaded plan=${subscription.plan} preset=not_found`);
      }
    } else {
      this.logger.log(`[AI_CONFIG] plan_loaded subscription=none`);
    }

    // --- 3. Override por Tenant ---
    const tenantCfg = await this.getConfig(tenantId);
    this.logger.log(
      `[AI_CONFIG] tenant_override_loaded tenantId=${tenantId} useGlobalDefaults=${tenantCfg.useGlobalDefaults}`,
    );

    // --- Resolução Final ---
    let resolved: EffectiveAiAgentConfig;

    if (tenantCfg.useGlobalDefaults) {
      // Herda global + restrições do plano
      const merged = { ...globalDefaults, ...planOverrides };
      resolved = {
        tenantId,
        useGlobalDefaults: true,
        isEnabled: tenantCfg.isEnabled, // isEnabled sempre vem do tenant (liga/desliga agente)
        agentName: merged.agentName,
        greetingMessage: tenantCfg.greetingMessage,
        tone: merged.tone,
        customInstructions: tenantCfg.customInstructions,
        operatingMode: tenantCfg.operatingMode,
        handoffPolicy: tenantCfg.handoffPolicy,
        fallbackMessage: tenantCfg.fallbackMessage,
        maxRetries: tenantCfg.maxRetries,
        sessionTimeoutMin: tenantCfg.sessionTimeoutMin,
        dailyMessageLimit: tenantCfg.dailyMessageLimit,
        customerCooldownMin: tenantCfg.customerCooldownMin,
        simulateTyping: merged.simulateTyping,
        debounceMs: merged.debounceMs,
        memoryEnabled: merged.memoryEnabled,
        rememberCustomerName: merged.rememberCustomerName,
        rememberAddresses: merged.rememberAddresses,
        rememberLastOrder: merged.rememberLastOrder,
        rememberPreferences: merged.rememberPreferences,
        allowRepeatLastOrder: merged.allowRepeatLastOrder,
        memoryRetentionDays: merged.memoryRetentionDays,
        tenant: tenantCfg.tenant,
        _resolution: {
          source: planPresetName ? 'plan_override' : 'global_only',
          planPreset: planPresetName,
        },
      };
    } else {
      // Override próprio do tenant — usa config local, mas ainda aplica restrições de plano
      const localMemory = {
        memoryEnabled: tenantCfg.memoryEnabled,
        rememberCustomerName: tenantCfg.rememberCustomerName,
        rememberAddresses: tenantCfg.rememberAddresses,
        rememberLastOrder: tenantCfg.rememberLastOrder,
        rememberPreferences: tenantCfg.rememberPreferences,
        allowRepeatLastOrder: tenantCfg.allowRepeatLastOrder,
        memoryRetentionDays: tenantCfg.memoryRetentionDays,
      };
      const withPlanRestrictions = { ...localMemory, ...planOverrides };

      resolved = {
        tenantId,
        useGlobalDefaults: false,
        isEnabled: tenantCfg.isEnabled,
        agentName: tenantCfg.agentName ?? globalDefaults.agentName,
        greetingMessage: tenantCfg.greetingMessage,
        tone: tenantCfg.tone,
        customInstructions: tenantCfg.customInstructions,
        operatingMode: tenantCfg.operatingMode,
        handoffPolicy: tenantCfg.handoffPolicy,
        fallbackMessage: tenantCfg.fallbackMessage,
        maxRetries: tenantCfg.maxRetries,
        sessionTimeoutMin: tenantCfg.sessionTimeoutMin,
        dailyMessageLimit: tenantCfg.dailyMessageLimit,
        customerCooldownMin: tenantCfg.customerCooldownMin,
        simulateTyping: tenantCfg.simulateTyping,
        debounceMs: tenantCfg.debounceMs,
        ...withPlanRestrictions,
        tenant: tenantCfg.tenant,
        _resolution: {
          source: 'tenant_override',
          planPreset: planPresetName,
        },
      };
    }

    this.logger.log(
      `[AI_CONFIG] effective_config_resolved tenantId=${tenantId} source=${resolved._resolution.source} memoryEnabled=${resolved.memoryEnabled} isEnabled=${resolved.isEnabled}`,
    );

    return resolved;
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
      memoryEnabled: dto.memoryEnabled,
      rememberCustomerName: dto.rememberCustomerName,
      rememberAddresses: dto.rememberAddresses,
      rememberLastOrder: dto.rememberLastOrder,
      rememberPreferences: dto.rememberPreferences,
      allowRepeatLastOrder: dto.allowRepeatLastOrder,
      memoryRetentionDays: dto.memoryRetentionDays,
      useGlobalDefaults: dto.useGlobalDefaults,
    };

    // Remove campos apenas se forem undefined (PATCH semântico)
    const cleanData = Object.fromEntries(
      Object.entries(allowedFields).filter(([, value]) => value !== undefined),
    );

    const updated = await this.prisma.aiAgentConfig.update({
      where: { tenantId },
      data: cleanData,
    });

    this.logger.log(
      `AI Config updated for tenant ${tenantId} useGlobalDefaults=${updated.useGlobalDefaults}`,
    );
    return updated;
  }
}
