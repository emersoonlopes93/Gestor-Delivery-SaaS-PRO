import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { StorefrontPreviewRequest } from '@gestor/types';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { StorefrontService } from './storefront.service';

@Controller('tenant/storefront-preview')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class StorefrontPreviewController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Post()
  @RequirePermissions('settings.manage')
  async getStorefrontPreview(
    @CurrentTenant() tenantId: string,
    @Body() body: StorefrontPreviewRequest,
  ) {
    return this.storefrontService.getStorefrontPreviewPayload(
      tenantId,
      body.customization,
      body.fulfillmentType,
    );
  }
}
