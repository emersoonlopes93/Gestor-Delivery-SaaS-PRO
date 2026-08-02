import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getDefaultStorefrontLayoutSettings, getDefaultStorefrontThemeSettings } from '@gestor/theme';
import type { StorefrontPayload, StorefrontProductPayload } from '@gestor/types';
import { StorefrontPreview } from './StorefrontPreview';

function product(id: string, name: string, basePrice: number): StorefrontProductPayload {
  return {
    id,
    name,
    slug: id,
    shortDescription: `Descrição ${name}`,
    image: `https://example.com/${id}.png`,
    basePrice,
    compareAtPrice: basePrice + 5,
    isAvailable: true,
    optionGroupLinks: [],
    complementGroups: [],
    upsellLinks: [],
    badges: [{ id: 'promotion', label: 'Promoção', variant: 'success', priority: 1 }],
  };
}

describe('StorefrontPreview', () => {
  it('renders canonical category, product, price, badges, theme and showcase order', () => {
    const first = product('product-a', 'Produto A', 12);
    const second = product('product-b', 'Produto B', 20);
    const theme = { ...getDefaultStorefrontThemeSettings(), primaryColor: '#123456' };
    const layout = { ...getDefaultStorefrontLayoutSettings(), productLayout: 'list' as const };
    const payload: StorefrontPayload = {
      tenant: {
        id: 'tenant-1',
        name: 'Loja teste',
        slug: 'loja-teste',
        logo: null,
        banner: null,
        isOpen: true,
        statusMessage: 'Aberto agora',
        paymentMethods: [],
        whatsappNumber: null,
        orderModes: { deliveryEnabled: true, pickupEnabled: true, dineInEnabled: false, scheduledOrdersEnabled: false, allowScheduleWhenClosed: false, pickupMinMinutes: null, pickupMaxMinutes: null },
        scheduling: { enabled: false, allowWhenClosed: false, timezone: 'America/Sao_Paulo', maximumAdvanceDays: 7 },
      },
      categories: [{ id: 'category-1', name: 'Categoria 1', slug: 'categoria-1', order: 1, products: [first, second] }],
      combos: [],
      upsells: [],
      customization: { theme, layout },
      showcase: { title: 'Escolhas', products: [second, first] },
    };

    const html = renderToStaticMarkup(<StorefrontPreview payload={payload} />);

    expect(html).toContain('--storefront-primary:#123456');
    expect(html).toContain('Categoria 1');
    expect(html).toContain('Produto A');
    expect(html).toContain('R$ 12.00');
    expect(html).toContain('Promoção');
    expect(html.indexOf('Produto B')).toBeLessThan(html.indexOf('Produto A'));
    expect(html).toContain('Escolhas');
  });
});
