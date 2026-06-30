import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { RequireAdminPermissions } from '../../common/decorators';
import { FeatureControlService } from '../../feature-control/feature-control.service';

@Controller('admin/features')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminFeaturesController {
  constructor(private readonly featureControlService: FeatureControlService) {}

  @Get('catalog')
  @RequireAdminPermissions('saas.modules.read')
  listCatalog() {
    return this.featureControlService.getFeatureCatalog();
  }
}
