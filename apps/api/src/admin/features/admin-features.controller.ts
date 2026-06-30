import { BadRequestException, Body, Controller, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { Post } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { CurrentUser, RequireAdminPermissions } from '../../common/decorators';
import { FeatureControlService } from '../../feature-control/feature-control.service';
import type { FeatureOperationalStatus, FeaturePresetKey } from '@gestor/core';

type UpdateFeatureStatusBody = {
  status: FeatureOperationalStatus;
  reason?: string;
};

const ALLOWED_FEATURE_STATUSES: FeatureOperationalStatus[] = [
  'enabled',
  'disabled',
  'beta',
  'internal',
  'coming_soon',
];

type ApplyGlobalPresetBody = {
  reason?: string;
  confirmation?: string;
};

@Controller('admin/features')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminFeaturesController {
  constructor(private readonly featureControlService: FeatureControlService) {}

  @Get()
  @RequireAdminPermissions('saas.modules.read')
  listFeatures() {
    return this.featureControlService.getAdminFeatureCatalog();
  }

  @Get('catalog')
  @RequireAdminPermissions('saas.modules.read')
  listCatalog() {
    return this.featureControlService.getAdminFeatureCatalog();
  }

  @Get('presets')
  @RequireAdminPermissions('saas.modules.read')
  listPresets() {
    return this.featureControlService.listPresets();
  }

  @Post('presets/:presetKey/preview')
  @RequireAdminPermissions('saas.modules.read')
  previewPreset(@Param('presetKey') presetKey: FeaturePresetKey) {
    return this.featureControlService.previewPreset({
      presetKey,
      scope: 'global',
    });
  }

  @Post('presets/:presetKey/apply-global')
  @RequireAdminPermissions('saas.modules.manage')
  applyGlobalPreset(
    @Param('presetKey') presetKey: FeaturePresetKey,
    @Body() body: ApplyGlobalPresetBody,
    @CurrentUser('sub') adminId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.featureControlService.applyPresetGlobal({
      presetKey,
      reason: body.reason?.trim() ?? '',
      confirmation: body.confirmation?.trim() ?? '',
      adminId,
      ip: req.ip,
    });
  }

  @Patch(':featureKey/status')
  @RequireAdminPermissions('saas.modules.manage')
  updateStatus(
    @Param('featureKey') featureKey: string,
    @Body() body: UpdateFeatureStatusBody,
    @CurrentUser('sub') adminId: string,
    @Request() req: ExpressRequest,
  ) {
    if (!ALLOWED_FEATURE_STATUSES.includes(body.status)) {
      throw new BadRequestException('status invalido.');
    }

    return this.featureControlService.updateGlobalFeatureStatus({
      featureKey,
      status: body.status,
      reason: body.reason?.trim() ?? '',
      adminId,
      ip: req.ip,
    });
  }
}
