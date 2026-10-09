import { renderToStaticMarkup } from 'react-dom/server';
import type { StorefrontShowcasePayload } from '@gestor/types';
import { describe, expect, it, vi } from 'vitest';
import { SmartShowcase } from './SmartShowcase';

const showcase: StorefrontShowcasePayload = {
  title: 'Escolhas do chef',
  products: [{
    id: 'product-a',
    name: 'Produto A',
    slug: 'produto-a',
    basePrice: 12,
    isAvailable: true,
    optionGroupLinks: [],
    complementGroups: [],
    upsellLinks: [],
    badges: [],
  }],
};

describe('SmartShowcase', () => {
  it('does not render when the resolved list is absent', () => {
    const html = renderToStaticMarkup(
      <SmartShowcase productLayout="grid" onSelectProduct={vi.fn()} />,
    );
    expect(html).toBe('');
  });

  it('applies the configured title and reuses the current product CTA', () => {
    const html = renderToStaticMarkup(
      <SmartShowcase showcase={showcase} productLayout="grid" onSelectProduct={vi.fn()} />,
    );
    expect(html).toContain('Escolhas do chef');
    expect(html).toContain('Produto A');
    expect(html).toContain('Adicionar');
  });
});
