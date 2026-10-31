import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { IsOptional, IsString, IsEnum, ValidateIf } from 'class-validator';
import { SystemConfigService } from '../services/system-config.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions as Permissions } from '../../common/decorators';
import { WhatsAppProviderType, AiProviderType } from '@prisma/client';

export class UpdateIntegrationsConfigDto {
  [key: string]: unknown;

  @IsOptional()
  @IsString()
  appName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  platformLogoMediaId?: string | null;

  @IsOptional()
  @IsEnum(WhatsAppProviderType)
  defaultWhatsAppProvider?: WhatsAppProviderType;

  @IsOptional()
  @IsEnum(AiProviderType)
  defaultAiProvider?: AiProviderType;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  evolutionUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  evolutionGlobalToken?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  openaiApiKey?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  anthropicApiKey?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  googleAiApiKey?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  googleAiModel?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  openrouterApiKey?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  openrouterModel?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  baseAiPrompt?: string | null;

  // Campos que podem vir do frontend mas devem ser ignorados com segurança
  @IsOptional()
  id?: string;

  @IsOptional()
  updatedAt?: string | Date;

  @IsOptional()
  createdAt?: string | Date;
}

@Controller('admin/integrations')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminIntegrationsController {
  constructor(private readonly configService: SystemConfigService) {}

  @Get('config')
  @Permissions('saas.settings.read')
  async getConfig() {
    return this.configService.getConfig();
  }

  @Patch('config')
  @HttpCode(200)
  @Permissions('saas.settings.manage')
  async updateConfig(@Body() data: UpdateIntegrationsConfigDto) {
    if (Object.prototype.hasOwnProperty.call(data, 'baseAiPrompt') && data.baseAiPrompt != null) {
      throw new BadRequestException('baseAiPrompt deve ser atualizado em /admin/ai-agent/global-config');
    }

    return this.configService.updateConfig(data);
  }
}
