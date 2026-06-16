import { Body, Controller, Get, Param, Post, Put, Delete, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';
import { AdminGroupsService } from './admin-groups.service';

@Controller('admin/groups')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminGroupsController {
  constructor(private readonly groupsService: AdminGroupsService) {}

  @Get()
  @RequireAdminPermissions('saas.tenants.read')
  async list() {
    return this.groupsService.findAll();
  }

  @Post()
  @RequireAdminPermissions('saas.tenants.update')
  async create(@Body() data: { name: string; ownerId?: string }) {
    return this.groupsService.create(data);
  }

  @Get(':id/metrics')
  @RequireAdminPermissions('saas.tenants.read')
  async getMetrics(@Param('id') id: string) {
    return this.groupsService.getGroupMetrics(id);
  }

  @Put(':id/tenants')
  @RequireAdminPermissions('saas.tenants.update')
  async addTenant(@Param('id') id: string, @Body() data: { tenantId: string }) {
    return this.groupsService.addTenantToGroup(id, data.tenantId);
  }

  @Delete('tenants/:tenantId')
  @RequireAdminPermissions('saas.tenants.update')
  async removeTenant(@Param('tenantId') tenantId: string) {
    return this.groupsService.removeTenantFromGroup(tenantId);
  }
}
