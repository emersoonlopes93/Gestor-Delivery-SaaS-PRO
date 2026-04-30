import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';
import { AdminFranchiseService } from './admin-franchise.service';

@Controller('admin/franchises')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminFranchiseController {
  constructor(private readonly franchiseService: AdminFranchiseService) {}

  @Get()
  @RequireAdminPermissions('saas.franchise.read')
  async listGroups() {
    return this.franchiseService.listBusinessGroups();
  }

  @Get(':id/dashboard')
  @RequireAdminPermissions('saas.franchise.read')
  async getDashboard(
    @Param('id') id: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const startDate = start ? new Date(start) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = end ? new Date(end) : new Date();
    
    return this.franchiseService.getConsolidatedDashboard(id, startDate, endDate);
  }
}
