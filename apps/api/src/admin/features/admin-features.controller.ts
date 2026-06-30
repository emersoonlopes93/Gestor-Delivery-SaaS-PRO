import { BadRequestException, Body, Controller, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { CurrentUser, RequireAdminPermissions } from '../../common/decorators';
import { FeatureControlService } from '../../feature-control/feature-control.service';
import type { FeatureOperationalStatus } from '@gestor/core';

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
