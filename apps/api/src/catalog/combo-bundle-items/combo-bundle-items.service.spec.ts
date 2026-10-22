import { BadRequestException } from '@nestjs/common';
import { ComboBundleItemsService } from './combo-bundle-items.service';

describe('ComboBundleItemsService component eligibility', () => {
  it('does not persist a configurable component in a fixed bundle', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce({ id: 'combo-1', type: 'combo', comboMode: 'bundle' })
      .mockResolvedValueOnce({ id: 'product-1', isActive: true, type: 'simple' });
    const prisma = {
      tenantClient: {
        product: { findFirst },
        comboBundleItem: { create: jest.fn() },
      },
    };
    const eligibility = {
      assertEligibleProductIds: jest.fn().mockRejectedValue(new BadRequestException({
        code: 'COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED',
      })),
    };
    const service = new ComboBundleItemsService(
      prisma as never,
      { getTenantId: () => 'tenant-a' } as never,
      { recalculateComboBundlePrice: jest.fn() } as never,
      eligibility as never,
    );

    await expect(service.create('combo-1', { productId: 'product-1' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED' }),
    });
    expect(eligibility.assertEligibleProductIds).toHaveBeenCalledWith('tenant-a', ['product-1']);
    expect(prisma.tenantClient.comboBundleItem.create).not.toHaveBeenCalled();
  });
});
