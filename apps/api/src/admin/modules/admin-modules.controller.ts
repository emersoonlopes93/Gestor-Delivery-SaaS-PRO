import { Controller, Get, Param, UseGuards, Put, Body } from '@nestjs/common';
import { AdminModulesService } from './admin-modules.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';

@Controller('admin/modules')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminModulesController {
  constructor(private readonly modulesService: AdminModulesService) {}

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
    return this.modulesService.updateTenantModules(tenantId, body.modules);
  }
}
