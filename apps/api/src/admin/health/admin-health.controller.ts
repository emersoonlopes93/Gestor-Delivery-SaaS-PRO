import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';
import { AdminHealthService } from './admin-health.service';

@Controller('admin/health')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminHealthController {
  constructor(private readonly healthService: AdminHealthService) {}

  @Get('overview')
  @RequireAdminPermissions('saas.tenants.read')
  async getOverview() {
    return this.healthService.getHealthOverview();
  }

  @Get('tenant/:id')
  @RequireAdminPermissions('saas.tenants.read')
  async getTenantHealth(@Param('id') id: string) {
    return this.healthService.checkTenantHealth(id);
  }
}
