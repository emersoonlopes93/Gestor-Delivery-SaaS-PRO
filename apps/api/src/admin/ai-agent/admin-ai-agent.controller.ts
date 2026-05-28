import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  IsOptional,
  IsBoolean,
  IsNumber,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { AiAgentConfigService, UpdateAiAgentConfigDto } from '../../ai-agent/services/ai-agent-config.service';
import { AiAgentPlanPresetService, UpdateAiAgentPlanPresetDto } from './ai-agent-plan-preset.service';
import { SystemConfigService } from '../services/system-config.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions as Permissions } from '../../common/decorators';

// DTO legado de memória — mantido para compatibilidade com frontend antigo
export class UpdateAiAgentMemoryConfigDto {
  @IsOptional() @IsBoolean() memoryEnabled?: boolean;
  @IsOptional() @IsBoolean() rememberCustomerName?: boolean;
  @IsOptional() @IsBoolean() rememberAddresses?: boolean;
  @IsOptional() @IsBoolean() rememberLastOrder?: boolean;
  @IsOptional() @IsBoolean() rememberPreferences?: boolean;
  @IsOptional() @IsBoolean() allowRepeatLastOrder?: boolean;
  @IsOptional() @IsNumber() @Min(7) @Max(365) memoryRetentionDays?: number;

  // Campos extras que podem vir do frontend (ignorados silenciosamente)
  @IsOptional() id?: string;
  @IsOptional() tenantId?: string;
  @IsOptional() updatedAt?: string | Date;
  @IsOptional() createdAt?: string | Date;
  @IsOptional() agentName?: string;
  @IsOptional() greetingMessage?: string;
  @IsOptional() tone?: string;
  @IsOptional() customInstructions?: string;
  @IsOptional() operatingMode?: string;
  @IsOptional() handoffPolicy?: string;
  @IsOptional() fallbackMessage?: string;
  @IsOptional() maxRetries?: number;
  @IsOptional() sessionTimeoutMin?: number;
  @IsOptional() dailyMessageLimit?: number;
  @IsOptional() customerCooldownMin?: number;
  @IsOptional() simulateTyping?: boolean;
  @IsOptional() debounceMs?: number;
}

// DTO para atualizar a config global de IA no SystemConfig
export class UpdateGlobalAiConfigDto {
  @IsOptional() @IsString() baseAiPrompt?: string;
  @IsOptional() @IsString() aiDefaultAgentName?: string;
  @IsOptional() @IsString() aiDefaultTone?: string;
  @IsOptional() @IsBoolean() aiMemoryEnabled?: boolean;
  @IsOptional() @IsBoolean() aiRememberCustomerName?: boolean;
  @IsOptional() @IsBoolean() aiRememberAddresses?: boolean;
  @IsOptional() @IsBoolean() aiRememberLastOrder?: boolean;
  @IsOptional() @IsBoolean() aiRememberPreferences?: boolean;
  @IsOptional() @IsBoolean() aiAllowRepeatLastOrder?: boolean;
  @IsOptional() @IsNumber() @Min(7) @Max(365) aiMemoryRetentionDays?: number;
  @IsOptional() @IsNumber() @Min(1000) @Max(30000) aiDebounceMs?: number;
  @IsOptional() @IsBoolean() aiSimulateTyping?: boolean;
  @IsOptional() @IsBoolean() aiRequireCustomerName?: boolean;
  @IsOptional() @IsBoolean() aiRequireConfirmation?: boolean;
  @IsOptional() @IsBoolean() aiEnableUpsell?: boolean;
  @IsOptional() @IsBoolean() aiEnableHumanHandoff?: boolean;
}

@Controller('admin/ai-agent')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminAiAgentController {
  constructor(
    private readonly configService: AiAgentConfigService,
    private readonly planPresetService: AiAgentPlanPresetService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  // ─── Config Global de IA ──────────────────────────────────────────────────

  /**
   * GET /admin/ai-agent/global-config
   * Retorna as configurações globais do Agente IA (campos do SystemConfig).
   */
  @Get('global-config')
  @Permissions('saas.settings.read')
  async getGlobalConfig() {
    return this.systemConfigService.getConfig();
  }

  /**
   * PATCH /admin/ai-agent/global-config
   * Atualiza as configurações globais do Agente IA.
   */
  @Patch('global-config')
  @HttpCode(200)
  @Permissions('saas.settings.manage')
  async updateGlobalConfig(@Body() dto: UpdateGlobalAiConfigDto) {
    return this.systemConfigService.updateConfig(dto as Record<string, unknown>);
  }

  // ─── Presets por Plano ────────────────────────────────────────────────────

  /**
   * GET /admin/ai-agent/plan-presets
   * Lista todos os presets de configuração de IA por plano.
   */
  @Get('plan-presets')
  @Permissions('saas.settings.read')
  async listPlanPresets() {
    return this.planPresetService.listPresets();
  }

  /**
   * PATCH /admin/ai-agent/plan-presets/:plan
   * Cria ou atualiza o preset de IA para um plano específico (basic | pro | premium).
   */
  @Patch('plan-presets/:plan')
  @HttpCode(200)
  @Permissions('saas.settings.manage')
  async updatePlanPreset(
    @Param('plan') plan: string,
    @Body() dto: UpdateAiAgentPlanPresetDto,
  ) {
    return this.planPresetService.upsertPreset(plan, dto);
  }

  // ─── Config Efetiva por Tenant ────────────────────────────────────────────

  /**
   * GET /admin/ai-agent/tenants/:tenantId/effective-config
   * Retorna a configuração efetiva resolvida (global → plano → override).
   * Útil para diagnóstico e debug.
   */
  @Get('tenants/:tenantId/effective-config')
  @Permissions('saas.tenants.ai.read')
  async getTenantEffectiveConfig(@Param('tenantId') tenantId: string) {
    return this.configService.getEffectiveAiAgentConfig(tenantId);
  }

  /**
   * GET /admin/ai-agent/tenants/:tenantId/config
   * Retorna a configuração raw do tenant (override próprio).
   */
  @Get('tenants/:tenantId/config')
  @Permissions('saas.tenants.ai.read')
  async getTenantConfig(@Param('tenantId') tenantId: string) {
    return this.configService.getConfig(tenantId);
  }

  /**
   * PATCH /admin/ai-agent/tenants/:tenantId/config
   * Atualiza a configuração do tenant (inclui useGlobalDefaults).
   */
  @Patch('tenants/:tenantId/config')
  @HttpCode(200)
  @Permissions('saas.tenants.ai.manage')
  async updateTenantConfig(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateAiAgentConfigDto,
  ) {
    return this.configService.updateConfig(tenantId, dto);
  }
}
