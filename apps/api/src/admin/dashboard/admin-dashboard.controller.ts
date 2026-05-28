import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';
import { AdminDashboardService } from './admin-dashboard.service';
import type { DashboardStats, ActivityItem } from './admin-dashboard.types';

@Controller('admin/dashboard')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('stats')
  @RequireAdminPermissions('saas.tenants.read')
  async getStats(): Promise<DashboardStats> {
    return this.dashboardService.getStats();
  }

  @Get('recent-activity')
  @RequireAdminPermissions('saas.audit.read')
  async getRecentActivity(): Promise<{ items: ActivityItem[] }> {
    return this.dashboardService.getRecentActivity();
  }
}