import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { AdminAuthGuard } from '../../admin/auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../../admin/rbac/admin-permissions.guard';
import { RequireAdminPermissions as Permissions } from '../../common/decorators';
import { AiOrchestratorService } from '../services/ai-orchestrator.service';

export class TestAiAgentMessageDto {
  @IsString()
  @MinLength(1)
  tenantSlug!: string;

  @IsString()
  @MinLength(1)
  text!: string;

  @IsString()
  @MinLength(8)
  phone!: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

@Controller('admin/debug/ai-agent')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminDebugAiAgentController {
  constructor(private readonly orchestrator: AiOrchestratorService) {}

  @Post('test-message')
  @HttpCode(200)
  @Permissions('saas.settings.manage')
  async testMessage(@Body() dto: TestAiAgentMessageDto) {
    return this.orchestrator.debugTestInboundMessage({
      tenantSlug: dto.tenantSlug,
      text: dto.text,
      phone: dto.phone,
      dryRun: dto.dryRun ?? true,
    });
  }
}
