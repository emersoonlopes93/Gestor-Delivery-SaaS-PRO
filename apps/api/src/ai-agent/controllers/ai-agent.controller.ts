import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AiAgentConfigService, UpdateAiAgentConfigDto } from '../services/ai-agent-config.service';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';
import type { TenantJwtPayload } from '@gestor/types';

@Controller('ai-agent/config')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class AiAgentController {
  constructor(private readonly configService: AiAgentConfigService) {}

  @Get()
  @Permissions('settings.manage')
  async getConfig(@Request() req: { user: TenantJwtPayload }) {
    return this.configService.getConfig(req.user.tenantId);
  }

  @Patch()
  @Permissions('settings.manage')
  async updateConfig(@Request() req: { user: TenantJwtPayload }, @Body() dto: UpdateAiAgentConfigDto) {
    return this.configService.updateConfig(req.user.tenantId, dto);
  }
}
