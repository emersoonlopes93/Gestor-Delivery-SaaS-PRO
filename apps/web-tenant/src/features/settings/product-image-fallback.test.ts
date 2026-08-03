import { describe, expect, it } from 'vitest';
import {
  nextProductImageAfterError,
  PRODUCT_FALLBACK_IMAGES,
  resolveProductImage,
} from '@gestor/storefront-ui';

describe('canonical product image fallback', () => {
  it('keeps the product image as the first choice', () => {
    const result = resolveProductImage({ productImage: 'https://cdn.example/product.webp', businessSegment: 'PIZZARIA' });
    expect(result.source).toBe('product');
    expect(result.src).toBe('https://cdn.example/product.webp');
    expect(result.fallbackSrc).toBe(PRODUCT_FALLBACK_IMAGES.PIZZARIA);
  });

  it.each([
    ['PIZZARIA', PRODUCT_FALLBACK_IMAGES.PIZZARIA],
    ['ACAI', PRODUCT_FALLBACK_IMAGES.ACAI],
    ['MERCADO', PRODUCT_FALLBACK_IMAGES.MERCADO],
  ] as const)('uses the %s segment asset when the product has no image', (businessSegment, expected) => {
    expect(resolveProductImage({ productImage: null, businessSegment }).src).toBe(expected);
  });

  it('normalizes null and OTHER to the generic asset', () => {
    expect(resolveProductImage({ productImage: null, businessSegment: null }).src).toBe(PRODUCT_FALLBACK_IMAGES.OTHER);
    expect(resolveProductImage({ productImage: null, businessSegment: 'OTHER' }).src).toBe(PRODUCT_FALLBACK_IMAGES.OTHER);
  });

  it('falls back once for a broken URL without retrying the final asset', () => {
    const fallback = PRODUCT_FALLBACK_IMAGES.PIZZARIA;
    expect(nextProductImageAfterError('https://cdn.example/broken.webp', fallback)).toBe(fallback);
    expect(nextProductImageAfterError(fallback, fallback)).toBeNull();
  });
});
