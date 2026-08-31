import { describe, expect, it } from 'vitest';
import { PRODUCT_FALLBACK_IMAGES, resolveProductImage } from './product-image';

describe('storefront product image fallback', () => {
  it('keeps a product image ahead of the segment fallback', () => {
    expect(resolveProductImage({
      productImage: 'https://cdn.example/product.webp',
      businessSegment: 'PIZZARIA',
    })).toEqual({
      src: 'https://cdn.example/product.webp',
      fallbackSrc: PRODUCT_FALLBACK_IMAGES.PIZZARIA,
      source: 'product',
    });
  });

  it('uses the segment fallback when the product has no image', () => {
    expect(resolveProductImage({ productImage: null, businessSegment: 'ACAI' }).src)
      .toBe(PRODUCT_FALLBACK_IMAGES.ACAI);
  });
});
