import { STOREFRONT_CACHE_INVALIDATION_MODELS } from './prisma.service';

describe('storefront cache invalidation models', () => {
  it.each([
    'Product',
    'ProductCategory',
    'OptionGroup',
    'OptionItem',
    'ProductOptionGroupLink',
    'ProductOptionItemPrice',
  ])('invalidates storefront cache after %s writes', (model) => {
    expect(STOREFRONT_CACHE_INVALIDATION_MODELS.has(model)).toBe(true);
  });

  it('does not retain obsolete Prisma model names', () => {
    expect(STOREFRONT_CACHE_INVALIDATION_MODELS.has('ProductOptionGroup')).toBe(false);
    expect(STOREFRONT_CACHE_INVALIDATION_MODELS.has('OptionGroupItem')).toBe(false);
  });
});
