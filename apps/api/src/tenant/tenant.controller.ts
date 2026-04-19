import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { UpdateOperatingHoursRequest, UpdateStorePauseRequest } from '@gestor/types';

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

  /**
   * Get operating hours.
   */
  @Get('operating-hours')
  @RequirePermissions('settings.manage')
  async getOperatingHours(@CurrentTenant() tenantId: string) {
    return this.tenantService.getOperatingHours(tenantId);
  }

  /**
   * Update operating hours in batch.
   */
  @Patch('operating-hours')
  @RequirePermissions('settings.manage')
  async updateOperatingHours(
    @CurrentTenant() tenantId: string,
    @Body() body: UpdateOperatingHoursRequest,
  ) {
    return this.tenantService.updateOperatingHours(tenantId, body.hours);
  }

  /**
   * Update store pause status.
   */
  @Patch('store-pause')
  @RequirePermissions('settings.manage')
  async updateStorePause(
    @CurrentTenant() tenantId: string,
    @Body() body: UpdateStorePauseRequest,
  ) {
    return this.tenantService.updateStorePause(tenantId, body.isStorePaused, body.storePauseReason);
  }
}

