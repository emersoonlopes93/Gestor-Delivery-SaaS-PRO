import { Controller, Get, Param, Query, UseGuards, Patch, Put, Body } from '@nestjs/common';
import { AdminTenantsService } from './admin-tenants.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';

@Controller('admin/tenants')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminTenantsController {
  constructor(private readonly tenantsService: AdminTenantsService) {}

  @Get()
  @RequireAdminPermissions('saas.tenants.read')
  async findAll(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.tenantsService.findAll(page || 1, pageSize || 20);
  }

  @Get(':id')
  @RequireAdminPermissions('saas.tenants.read')
  async findById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Patch(':id/status')
  @RequireAdminPermissions('saas.tenants.update')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'inactive' | 'suspended' | 'trial' },
  ) {
    return this.tenantsService.updateStatus(id, body.status);
  }

  @Put(':id')
  @RequireAdminPermissions('saas.tenants.update')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; slug?: string },
  ) {
    return this.tenantsService.update(id, body);
  }
}
