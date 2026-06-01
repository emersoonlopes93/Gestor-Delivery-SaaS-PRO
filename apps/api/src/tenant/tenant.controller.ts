import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { OnboardingService } from './onboarding.service';
import { UpdateOperatingHoursRequest, UpdateStorePauseRequest } from '@gestor/types';

@Controller('tenant')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * Get the current tenant context and settings.
   */
  @Get('me')
  @RequirePermissions('dashboard.view')
  async getCurrentTenant(@CurrentTenant() tenantId: string) {
    return this.tenantService.findById(tenantId);
  }

  /**
   * Update tenant basic info.
   */
  @Patch()
  @RequirePermissions('settings.manage')
  async updateTenant(
    @CurrentTenant() tenantId: string,
    @Body() body: { name: string },
  ) {
    return this.tenantService.update(tenantId, body);
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

  /**
   * Get onboarding status.
   */
  @Get('onboarding')
  @RequirePermissions('dashboard.view')
  async getOnboardingStatus(@CurrentTenant() tenantId: string) {
    return this.onboardingService.getOnboardingStatus(tenantId);
  }

  /**
   * Update onboarding step.
   */
  @Patch('onboarding-step')
  async updateOnboardingStep(
    @CurrentTenant() tenantId: string,
    @Body() body: { step: 'basicInfo' | 'catalog' | 'payment' | 'firstOrder'; completed?: boolean },
  ) {
    return this.onboardingService.updateStep(tenantId, body.step, body.completed ?? true);
  }

  /**
   * Get storefront customization.
   */
  @Get('storefront-customization')
  @RequirePermissions('settings.manage')
  async getStorefrontCustomization(@CurrentTenant() tenantId: string) {
    return this.tenantService.getStorefrontCustomization(tenantId);
  }

  /**
   * Update storefront customization.
   */
  @Patch('storefront-customization')
  @RequirePermissions('settings.manage')
  async updateStorefrontCustomization(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
  ) {
    return this.tenantService.updateStorefrontCustomization(tenantId, body);
  }

  @Get('test-route')
  async testRoute() {
    return { message: 'Tenant controller is reachable' };
  }

  /**
   * Complete overall onboarding.
   */
  @Post('onboarding-complete')
  async completeOnboarding(@CurrentTenant() tenantId: string) {
    return this.onboardingService.completeOnboarding(tenantId);
  }
}

