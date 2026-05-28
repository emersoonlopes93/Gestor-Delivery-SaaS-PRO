import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { IsOptional, IsBoolean, IsNumber, Min, Max, IsString } from 'class-validator';
import { AiAgentConfigService, UpdateAiAgentConfigDto } from '../../ai-agent/services/ai-agent-config.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions as Permissions } from '../../common/decorators';

export class UpdateAiAgentMemoryConfigDto {
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

  // Campos que podem vir do frontend mas devem ser ignorados com segurança
  @IsOptional()
  id?: string;

  @IsOptional()
  tenantId?: string;

  @IsOptional()
  updatedAt?: string | Date;

  @IsOptional()
  createdAt?: string | Date;

  @IsOptional()
  agentName?: string;

  @IsOptional()
  greetingMessage?: string;

  @IsOptional()
  tone?: string;

  @IsOptional()
  customInstructions?: string;

  @IsOptional()
  operatingMode?: string;

  @IsOptional()
  handoffPolicy?: string;

  @IsOptional()
  fallbackMessage?: string;

  @IsOptional()
  maxRetries?: number;

  @IsOptional()
  sessionTimeoutMin?: number;

  @IsOptional()
  dailyMessageLimit?: number;

  @IsOptional()
  customerCooldownMin?: number;

  @IsOptional()
  simulateTyping?: boolean;

  @IsOptional()
  debounceMs?: number;
}

@Controller('admin/ai-agent')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminAiAgentController {
  constructor(private readonly configService: AiAgentConfigService) {}

  @Get('tenants/:tenantId/config')
  @Permissions('saas.tenants.ai.read')
  async getTenantConfig(@Param('tenantId') tenantId: string) {
    return this.configService.getConfig(tenantId);
  }

  @Patch('tenants/:tenantId/config')
  @HttpCode(200)
  @Permissions('saas.tenants.ai.manage')
  async updateTenantConfig(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateAiAgentMemoryConfigDto,
  ) {
    return this.configService.updateConfig(tenantId, dto);
  }
}
