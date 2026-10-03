import { BadRequestException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../database/prisma.service';
import { getDefaultStorefrontLayoutSettings } from '@gestor/theme';
import { TenantService } from './tenant.service';

describe('TenantService storefront showcase validation', () => {
  it('rejects configured product IDs that do not belong to the authenticated tenant', async () => {
    const productFindMany = jest.fn().mockResolvedValue([{ id: 'own-product' }]);
    const tenantSettingsUpdate = jest.fn();
    const prisma = Object.assign(Object.create(PrismaService.prototype) as PrismaService, {
      product: { findMany: productFindMany },
      tenantSettings: { update: tenantSettingsUpdate },
    });
    const cacheManager = Object.assign(Object.create(null) as Cache, { del: jest.fn() });
    const service = new TenantService(prisma, cacheManager);

    const layout = getDefaultStorefrontLayoutSettings();
    layout.showcase = {
      ...layout.showcase,
      enabled: true,
      manualProductIds: ['own-product', 'other-tenant-product'],
    };

    await expect(service.updateStorefrontCustomization('tenant-a', { layout }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(productFindMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: { in: ['own-product', 'other-tenant-product'] } },
      select: { id: true },
    });
    expect(tenantSettingsUpdate).not.toHaveBeenCalled();
  });
});
