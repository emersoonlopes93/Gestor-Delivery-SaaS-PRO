import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AiAgentConfigService, UpdateAiAgentConfigDto } from '../services/ai-agent-config.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';

@Controller('ai-agent/config')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiAgentController {
  constructor(private readonly configService: AiAgentConfigService) {}

  @Get()
  @Permissions('settings.manage')
  async getConfig(@Request() req: { user: { tenantId: string } }) {
    return this.configService.getConfig(req.user.tenantId);
  }

  @Patch()
  @Permissions('settings.manage')
  async updateConfig(@Request() req: { user: { tenantId: string } }, @Body() dto: UpdateAiAgentConfigDto) {
    return this.configService.updateConfig(req.user.tenantId, dto);
  }
}
