import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Request } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AdminTenantsService } from './admin-tenants.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions, CurrentUser } from '../../common/decorators';
import { TenantAuthService } from '../../auth/tenant-auth.service';
import { BillingEntitlementsService, TenantFeatureKey } from '../../billing/billing-entitlements.service';
import { FeatureControlService } from '../../feature-control/feature-control.service';
import type { FeaturePresetKey } from '@gestor/core';
import type { FeatureTenantOverrideMode } from '@gestor/types';

@Controller('admin/tenants')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminTenantsController {
  constructor(
    private readonly tenantsService: AdminTenantsService,
    private readonly tenantAuthService: TenantAuthService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    private readonly featureControlService: FeatureControlService,
  ) {}



  @Get()
  @RequireAdminPermissions('saas.tenants.read')
  async findAll(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.tenantsService.findAll(page || 1, pageSize || 20);
  }

  @Get('health')
  @RequireAdminPermissions('saas.tenants.read')
  async getHealthOverview(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('operationalStatus') operationalStatus?: string,
    @Query('billingStatus') billingStatus?: string,
    @Query('whatsappStatus') whatsappStatus?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const size = pageSize ? parseInt(pageSize, 10) : 20;
    return this.tenantsService.getHealthOverview(p, size, search, operationalStatus, billingStatus, whatsappStatus);
  }

  @Get(':id')
  @RequireAdminPermissions('saas.tenants.read')
  async findById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Post()
  @RequireAdminPermissions('saas.tenants.create')
  async create(
    @Body() body: { name: string; slug: string; status?: 'active' | 'inactive' | 'suspended' | 'trial'; billingPlanId?: string },
  ) {
    return this.tenantsService.create(body);
  }

  @Patch(':id/status')
  @RequireAdminPermissions('saas.tenants.update')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'inactive' | 'suspended' | 'trial'; reason?: string },
    @CurrentUser('sub') adminId: string,
  ) {
    return this.tenantsService.updateStatus(id, body.status, adminId, body.reason);
  }

  @Put(':id')
  @RequireAdminPermissions('saas.tenants.update')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; slug?: string },
  ) {
    return this.tenantsService.update(id, body);
  }

  @Post(':id/billing-v2-subscription')
  @RequireAdminPermissions('saas.billing.manage')
  async createBillingV2Subscription(
    @Param('id') id: string,
    @Body() body: { billingPlanId?: string },
  ) {
    return this.tenantsService.createBillingV2Subscription(id, body.billingPlanId);
  }

  @Get(':id/entitlements')
  @RequireAdminPermissions('saas.tenants.read')
  async getTenantEntitlements(@Param('id') id: string) {
    return this.billingEntitlementsService.resolveTenantEntitlements(id);
  }

  @Get(':id/features')
  @RequireAdminPermissions('saas.tenants.read')
  async getTenantFeatures(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.featureControlService.getTenantFeatureCatalog(id, adminId);
  }

  @Patch(':id/features/:featureKey/override')
  @RequireAdminPermissions('saas.tenants.update')
  async updateTenantFeatureOverride(
    @Param('id') id: string,
    @Param('featureKey') featureKey: string,
    @Body() body: { mode?: FeatureTenantOverrideMode; reason?: string; expiresAt?: string | null },
    @CurrentUser('sub') adminId: string,
    @Request() req: ExpressRequest,
  ) {
    const mode = body.mode;
    if (mode !== 'inherit' && mode !== 'enabled' && mode !== 'disabled') {
      throw new BadRequestException('mode invalido.');
    }

    const expiresAt = body.expiresAt?.trim() ? new Date(body.expiresAt) : null;
    if (body.expiresAt?.trim() && Number.isNaN(expiresAt?.getTime())) {
      throw new BadRequestException('expiresAt invalido.');
    }

    return this.featureControlService.updateTenantFeatureOverride({
      tenantId: id,
      featureKey,
      mode,
      reason: body.reason,
      expiresAt,
      adminId,
      ip: req.ip,
    });
  }

  @Post(':id/features/presets/:presetKey/preview')
  @RequireAdminPermissions('saas.tenants.read')
  async previewTenantPreset(
    @Param('id') id: string,
    @Param('presetKey') presetKey: FeaturePresetKey,
  ) {
    return this.featureControlService.previewPreset({
      presetKey,
      scope: 'tenant',
      tenantId: id,
    });
  }

  @Post(':id/features/presets/:presetKey/apply')
  @RequireAdminPermissions('saas.tenants.update')
  async applyTenantPreset(
    @Param('id') id: string,
    @Param('presetKey') presetKey: FeaturePresetKey,
    @Body() body: { reason?: string; confirmation?: string },
    @CurrentUser('sub') adminId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.featureControlService.applyPresetTenant({
      tenantId: id,
      presetKey,
      reason: body.reason?.trim() ?? '',
      confirmation: body.confirmation?.trim() ?? '',
      adminId,
      ip: req.ip,
    });
  }

  @Put(':id/entitlements/:featureKey')
  @RequireAdminPermissions('saas.tenants.update')
  async upsertTenantEntitlementOverride(
    @Param('id') id: string,
    @Param('featureKey') featureKey: string,
    @Body() body: { enabled?: boolean; reason?: string; expiresAt?: string | null },
    @CurrentUser('sub') adminId: string,
  ) {
    const parsedKey = this.requireFeatureKey(featureKey);
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : null;
    if (enabled === null) {
      throw new BadRequestException('enabled e obrigatorio.');
    }
    const reason = body.reason?.trim();
    if (!reason) {
      throw new BadRequestException('reason e obrigatorio.');
    }
    const expiresAt = body.expiresAt?.trim() ? new Date(body.expiresAt) : null;
    if (body.expiresAt?.trim() && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('expiresAt invalido.');
    }

    await this.billingEntitlementsService.upsertTenantFeatureOverride({
      tenantId: id,
      featureKey: parsedKey,
      enabled,
      reason,
      expiresAt,
      adminId,
    });

    return this.billingEntitlementsService.resolveTenantEntitlements(id);
  }

  @Delete(':id/entitlements/:featureKey')
  @RequireAdminPermissions('saas.tenants.update')
  async deleteTenantEntitlementOverride(
    @Param('id') id: string,
    @Param('featureKey') featureKey: string,
    @Body() body: { reason?: string },
    @CurrentUser('sub') adminId: string,
  ) {
    const parsedKey = this.requireFeatureKey(featureKey);
    const reason = body.reason?.trim();
    if (!reason) {
      throw new BadRequestException('reason e obrigatorio.');
    }

    await this.billingEntitlementsService.deleteTenantFeatureOverride({
      tenantId: id,
      featureKey: parsedKey,
      reason,
      adminId,
    });

    return this.billingEntitlementsService.resolveTenantEntitlements(id);
  }
  
  @Post(':id/impersonate')
  @RequireAdminPermissions('saas.support.impersonate')
  async impersonate(
    @Param('id') id: string,
    @CurrentUser('sub') adminId: string,
    @Body() body: { reason?: string },
  ) {
    const reason = body.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Motivo da impersonation e obrigatorio.');
    }
    return this.tenantAuthService.impersonate(id, adminId, reason);
  }

  private requireFeatureKey(featureKey: string): TenantFeatureKey {
    const normalized = featureKey.trim() as TenantFeatureKey;
    const allowed: TenantFeatureKey[] = [
      'ai_agent',
      'campaigns',
      'ifood_integration',
      'advanced_reports',
      'custom_domain',
      'priority_support',
    ];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException('featureKey invalida.');
    }
    return normalized;
  }
}
