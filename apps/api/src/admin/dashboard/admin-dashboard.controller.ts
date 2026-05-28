import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin/dashboard')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('stats')
  @RequireAdminPermissions('saas.tenants.read')
  async getStats() {
    return this.dashboardService.getStats();
  }

  @Get('recent-activity')
  @RequireAdminPermissions('saas.audit.read')
  async getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }
}