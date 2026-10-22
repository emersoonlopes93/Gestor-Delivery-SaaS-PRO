import { BadRequestException } from '@nestjs/common';
import { ComboComponentEligibilityService, COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED } from './combo-component-eligibility.service';

function product(overrides: Partial<{ type: 'simple' | 'configurable' | 'combo'; isActive: boolean; templateType: 'pizza' | 'none' | null; groups: string[][] }> = {}) {
  return {
    id: 'product-1',
    type: overrides.type ?? 'simple',
    isActive: overrides.isActive ?? true,
    category: { templateType: overrides.templateType ?? 'none' },
    optionGroupLinks: (overrides.groups ?? []).map((items, index) => ({
      id: `link-${index}`,
      optionGroup: { items: items.map((id) => ({ id })) },
    })),
  };
}

describe('ComboComponentEligibilityService', () => {
  function service(products: ReturnType<typeof product>[], disabled: Array<{ productId: string; optionItemId: string }> = []) {
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue(products) },
      productOptionItemPrice: { findMany: jest.fn().mockResolvedValue(disabled) },
    };
    return { service: new ComboComponentEligibilityService(prisma as never), prisma };
  }

  it('accepts a true direct product and does not use the authoring type as the routing source', async () => {
    const subject = service([product({ type: 'configurable' })]);
    await expect(subject.service.assertEligibleProductIds('tenant-a', ['product-1'])).resolves.toBeUndefined();
  });

  it('rejects pizza and generic effective configuration with one public code', async () => {
    for (const candidate of [product({ templateType: 'pizza' }), product({ groups: [['item-1']] })]) {
      const subject = service([candidate]);
      await expect(subject.service.assertEligibleProductIds('tenant-a', ['product-1'])).rejects.toMatchObject({
        response: expect.objectContaining({ code: COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED }),
      });
    }
  });

  it('does not produce a false positive when every otherwise-active option is disabled for this product', async () => {
    const subject = service([product({ groups: [['item-1']] })], [{ productId: 'product-1', optionItemId: 'item-1' }]);
    await expect(subject.service.assertEligibleProductIds('tenant-a', ['product-1'])).resolves.toBeUndefined();
  });

  it('rejects an inactive component before it can enter the simplified combo contract', async () => {
    const subject = service([product({ isActive: false })]);
    await expect(subject.service.assertEligibleProductIds('tenant-a', ['product-1'])).rejects.toBeInstanceOf(BadRequestException);
  });
});
