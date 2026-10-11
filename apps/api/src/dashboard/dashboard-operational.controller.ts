import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { DashboardOperationalDTO } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { DashboardOperationalService, type DashboardOperationalQuery } from './dashboard-operational.service';

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

@Controller('dashboard')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DashboardOperationalController {
  constructor(private readonly dashboardOperationalService: DashboardOperationalService) {}

  @Get('operational')
  @RequirePermissions('dashboard.view')
  getOperationalDashboard(
    @CurrentTenant() tenantId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<DashboardOperationalDTO> {
    const result = querySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException('invalid operational dashboard query');
    }
    const request: DashboardOperationalQuery = { from: result.data.from, to: result.data.to };
    return this.dashboardOperationalService.getSnapshot(tenantId, request);
  }
}
