import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService combo component eligibility', () => {
  it('rolls back a pizza template transition for a category containing a combo component', async () => {
    const tx = {
      productCategory: {
        findFirst: jest.fn().mockResolvedValue({ templateType: null }),
        update: jest.fn().mockResolvedValue({ id: 'category-1', templateType: 'pizza' }),
      },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'component-1' }]) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
      tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 'tenant-store' }) },
    };
    const eligibility = {
      getProductConfigurationRoutes: jest.fn().mockResolvedValue(new Map([['component-1', 'direct']])),
      assertDoesNotInvalidateExistingComboComponents: jest.fn().mockRejectedValue(new BadRequestException({
        code: 'COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED',
      })),
    };
    const service = new CategoriesService(
      prisma as never,
      { getTenantId: () => 'tenant-a' } as never,
      eligibility as never,
      { del: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(service.update('category-1', { templateType: 'pizza' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED' }),
    });
    expect(tx.productCategory.update).toHaveBeenCalled();
  });
});
