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
import { BillingEntitlementsService } from '../../billing/billing-entitlements.service';
import { ForbiddenException } from '@nestjs/common';

@Controller('ai-agent/config')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class AiAgentController {
  constructor(
    private readonly configService: AiAgentConfigService,
    private readonly billingEntitlements: BillingEntitlementsService,
  ) {}

  @Get()
  @Permissions('settings.manage')
  async getConfig(@Request() req: { user: TenantJwtPayload }) {
    await this.assertAiAvailable(req.user.tenantId);
    return this.configService.getConfig(req.user.tenantId);
  }

  @Patch()
  @Permissions('settings.manage')
  async updateConfig(@Request() req: { user: TenantJwtPayload }, @Body() dto: UpdateAiAgentConfigDto) {
    await this.assertAiAvailable(req.user.tenantId);
    return this.configService.updateConfig(req.user.tenantId, dto);
  }

  private async assertAiAvailable(tenantId: string) {
    const entitlements = await this.billingEntitlements.resolveTenantEntitlements(tenantId);
    if (!entitlements.flags.canUseAiAgent) {
      throw new ForbiddenException('Seu plano atual nao libera o Agente IA. Ative o Trial Pro ou contrate o add-on.');
    }
  }
}
