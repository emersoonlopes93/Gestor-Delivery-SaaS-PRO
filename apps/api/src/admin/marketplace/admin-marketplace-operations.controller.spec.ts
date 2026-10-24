import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ADMIN_PERMISSIONS_KEY } from '../../common/decorators';
import { AdminMarketplaceOperationsController } from './admin-marketplace-operations.controller';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';

describe('AdminMarketplaceOperationsController security', () => {
  it('requires SaaS admin authentication and permissions at the controller boundary', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminMarketplaceOperationsController) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([AdminAuthGuard, AdminPermissionsGuard]));
  });

  it('uses separate read and manage permissions', () => {
    expect(Reflect.getMetadata(
      ADMIN_PERMISSIONS_KEY,
      AdminMarketplaceOperationsController.prototype.listOperations,
    )).toEqual(['saas.marketplace.read']);
    expect(Reflect.getMetadata(
      ADMIN_PERMISSIONS_KEY,
      AdminMarketplaceOperationsController.prototype.retryOperation,
    )).toEqual(['saas.marketplace.manage']);
  });
});
