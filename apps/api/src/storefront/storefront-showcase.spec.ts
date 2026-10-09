import type { StorefrontProductPayload } from '@gestor/types';
import { getDefaultStorefrontLayoutSettings, normalizeStorefrontLayout } from '@gestor/theme';
import { resolveStorefrontShowcase } from './storefront-showcase';

function product(id: string, badges: StorefrontProductPayload['badges'] = []): StorefrontProductPayload {
  return {
    id,
    name: `Product ${id}`,
    slug: `product-${id}`,
    basePrice: 10,
    isAvailable: true,
    optionGroupLinks: [],
    complementGroups: [],
    upsellLinks: [],
    badges,
  };
}

describe('resolveStorefrontShowcase', () => {
  const eligibleProducts = new Map([
    ['a', product('a')],
    ['b', product('b')],
    ['c', product('c', [{ id: 'promotion', label: 'Promoção', variant: 'success', priority: 1 }])],
  ]);

  it('does not resolve products when the showcase is disabled', () => {
    const settings = getDefaultStorefrontLayoutSettings().showcase;
    expect(resolveStorefrontShowcase({ settings, eligibleProducts, bestSellingProductIds: ['a'] })).toEqual([]);
  });

  it('preserves manual order, removes ineligible IDs and respects maxItems', () => {
    const settings = {
      ...getDefaultStorefrontLayoutSettings().showcase,
      enabled: true,
      maxItems: 2,
      manualProductIds: ['b', 'missing', 'a', 'b'],
    };

    expect(resolveStorefrontShowcase({ settings, eligibleProducts, bestSellingProductIds: [] }).map(({ id }) => id))
      .toEqual(['b', 'a']);
  });

  it('prioritizes manual products and fills hybrid slots without duplicates', () => {
    const settings = {
      ...getDefaultStorefrontLayoutSettings().showcase,
      enabled: true,
      mode: 'hybrid' as const,
      maxItems: 3,
      manualProductIds: ['b'],
      automaticStrategy: 'best_selling' as const,
    };

    expect(resolveStorefrontShowcase({ settings, eligibleProducts, bestSellingProductIds: ['b', 'c', 'a'] }).map(({ id }) => id))
      .toEqual(['b', 'c', 'a']);
  });

  it('uses only canonical promotion badges for the promotions strategy', () => {
    const settings = {
      ...getDefaultStorefrontLayoutSettings().showcase,
      enabled: true,
      mode: 'automatic' as const,
      automaticStrategy: 'promotions' as const,
    };

    expect(resolveStorefrontShowcase({ settings, eligibleProducts, bestSellingProductIds: [] }).map(({ id }) => id))
      .toEqual(['c']);
  });

  it('removes products rejected by canonical availability in every selection path', () => {
    const unavailable = { ...product('unavailable'), isAvailable: false };
    const productsWithUnavailable = new Map(eligibleProducts);
    productsWithUnavailable.set(unavailable.id, unavailable);
    const settings = {
      ...getDefaultStorefrontLayoutSettings().showcase,
      enabled: true,
      mode: 'hybrid' as const,
      maxItems: 3,
      manualProductIds: ['unavailable', 'a'],
      automaticStrategy: 'best_selling' as const,
    };

    expect(resolveStorefrontShowcase({
      settings,
      eligibleProducts: productsWithUnavailable,
      bestSellingProductIds: ['unavailable', 'b'],
    }).map(({ id }) => id)).toEqual(['a', 'b']);
  });
});

describe('normalizeStorefrontLayout showcase', () => {
  it('normalizes enums, bounds, title and duplicate product IDs server-side', () => {
    const layout = normalizeStorefrontLayout({
      showcase: {
        enabled: true,
        title: '  Minha vitrine  ',
        mode: 'hybrid',
        maxItems: 99,
        manualProductIds: ['a', 'a', 'b'],
        automaticStrategy: 'best_selling',
      },
    });

    expect(layout.showcase).toEqual({
      enabled: true,
      title: 'Minha vitrine',
      mode: 'hybrid',
      maxItems: 12,
      manualProductIds: ['a', 'b'],
      automaticStrategy: 'best_selling',
    });
  });
});
