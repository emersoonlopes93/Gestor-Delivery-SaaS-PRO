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
      comboBundleItem: { findFirst: jest.fn().mockResolvedValue(null) },
      comboSlotAllowedItem: { findFirst: jest.fn().mockResolvedValue(null) },
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

  it('rejects a direct component becoming generic after it was already referenced by a combo', async () => {
    const before = service([product()]);
    const tx = {
      product: { findMany: jest.fn().mockResolvedValue([product({ groups: [['item-1']] })]) },
      productOptionItemPrice: { findMany: jest.fn().mockResolvedValue([]) },
      comboBundleItem: { findFirst: jest.fn().mockResolvedValue({ id: 'bundle-link-1' }) },
      comboSlotAllowedItem: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const routesBefore = await before.service.getProductConfigurationRoutes('tenant-a', ['product-1']);
    await expect(
      before.service.assertDoesNotInvalidateExistingComboComponents('tenant-a', ['product-1'], routesBefore, tx as never),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED }) });
  });

  it('allows an unrelated edit when a legacy combo component was already non-direct', async () => {
    const subject = service([product({ groups: [['item-1']] })]);
    const tx = {
      product: { findMany: jest.fn().mockResolvedValue([product({ groups: [['item-1']] })]) },
      productOptionItemPrice: { findMany: jest.fn().mockResolvedValue([]) },
      comboBundleItem: { findFirst: jest.fn() },
      comboSlotAllowedItem: { findFirst: jest.fn() },
    };
    const routesBefore = await subject.service.getProductConfigurationRoutes('tenant-a', ['product-1']);
    await expect(
      subject.service.assertDoesNotInvalidateExistingComboComponents('tenant-a', ['product-1'], routesBefore, tx as never),
    ).resolves.toBeUndefined();
    expect(tx.comboBundleItem.findFirst).not.toHaveBeenCalled();
  });
});
