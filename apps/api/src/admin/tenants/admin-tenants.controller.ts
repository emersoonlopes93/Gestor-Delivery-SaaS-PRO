import { Controller, Get, Param, Query, UseGuards, Patch, Put, Body } from '@nestjs/common';
import { AdminTenantsService } from './admin-tenants.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions, CurrentUser } from '../../common/decorators';
import { TenantAuthService } from '../../auth/tenant-auth.service';

@Controller('admin/tenants')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminTenantsController {
  constructor(
    private readonly tenantsService: AdminTenantsService,
    private readonly tenantAuthService: TenantAuthService,
  ) {}

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
  
  @Get(':id/impersonate')
  @RequireAdminPermissions('saas.tenants.update')
  async impersonate(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Query('reason') reason?: string,
  ) {
    return this.tenantAuthService.impersonate(id, adminId, reason || 'Support request');
  }
}
