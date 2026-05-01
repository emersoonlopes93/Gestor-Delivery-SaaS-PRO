import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { SystemConfigService } from '../services/system-config.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';
import { WhatsAppProviderType, AiProviderType } from '@prisma/client';

@Controller('admin/integrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminIntegrationsController {
  constructor(private readonly configService: SystemConfigService) {}

  @Get('config')
  @Permissions('saas.settings.read')
  async getConfig() {
    return this.configService.getConfig();
  }

  @Patch('config')
  @HttpCode(200)
  @Permissions('saas.settings.write')
  async updateConfig(@Body() data: {
    defaultWhatsAppProvider?: WhatsAppProviderType;
    defaultAiProvider?: AiProviderType;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    metaAccessToken?: string;
    metaAppSecret?: string;
  }) {
    return this.configService.updateConfig(data);
  }
}
