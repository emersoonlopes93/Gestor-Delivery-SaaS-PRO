import { Controller, Get, Param, UseGuards, Put, Body, Inject, forwardRef } from '@nestjs/common';
import { AdminModulesService } from './admin-modules.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';
import { AiAgentConfigService } from '../../ai-agent/services/ai-agent-config.service';

@Controller('admin/modules')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminModulesController {
  constructor(
    private readonly modulesService: AdminModulesService,
    @Inject(forwardRef(() => AiAgentConfigService))
    private readonly aiConfigService: AiAgentConfigService,
  ) {}

  @Get()
  @RequireAdminPermissions('saas.modules.read')
  async listAvailable() {
    return this.modulesService.getAvailableModules();
  }

  @Get(':tenantId')
  @RequireAdminPermissions('saas.modules.read')
  async getTenantModules(@Param('tenantId') tenantId: string) {
    return this.modulesService.getTenantModules(tenantId);
  }

  @Put(':tenantId')
  @RequireAdminPermissions('saas.modules.manage')
  async updateTenantModules(
    @Param('tenantId') tenantId: string,
    @Body() body: { modules: { module: string; enabled: boolean }[] },
  ) {
    const result = await this.modulesService.updateTenantModules(tenantId, body.modules);

    // Se o módulo ai_agent foi ativado, garantir que a config padrão existe
    const aiAgentModule = body.modules.find((m) => m.module === 'ai_agent');
    if (aiAgentModule?.enabled) {
      try {
        await this.aiConfigService.getConfig(tenantId);
      } catch (error) {
        // Log silencioso - a config será criada automaticamente no GET
        console.warn(`Erro ao criar config padrão do AI Agent para tenant ${tenantId}:`, error);
      }
    }

    return result;
  }
}
