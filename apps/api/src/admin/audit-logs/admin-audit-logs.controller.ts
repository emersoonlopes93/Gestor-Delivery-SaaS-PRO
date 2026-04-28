import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuditLogsService } from './admin-audit-logs.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';

@Controller('admin/audit-logs')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminAuditLogsController {
  constructor(private readonly auditLogsService: AdminAuditLogsService) {}

  @Get()
  @RequireAdminPermissions('saas.audit.read')
  async findAll(
    @Query('tenantId') tenantId?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.auditLogsService.findAll({
      tenantId,
      action,
      userId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page: page || 1,
      pageSize: pageSize || 25,
    });
  }

  @Get('actions')
  @RequireAdminPermissions('saas.audit.read')
  async getActions() {
    return this.auditLogsService.getActions();
  }
}
