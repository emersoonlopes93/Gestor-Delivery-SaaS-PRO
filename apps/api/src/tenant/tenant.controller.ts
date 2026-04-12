import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

@Controller('tenant')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Get the current tenant context and settings.
   */
  @Get('me')
  @RequirePermissions('dashboard.view')
  async getCurrentTenant(@CurrentTenant() tenantId: string) {
    return this.tenantService.findById(tenantId);
  }

  /**
   * Update tenant settings.
   */
  @Patch('settings')
  @RequirePermissions('settings.manage')
  async updateSettings(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenantService.updateSettings(tenantId, dto);
  }
}
