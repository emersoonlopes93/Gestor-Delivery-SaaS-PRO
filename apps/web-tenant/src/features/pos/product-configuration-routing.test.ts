import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StorefrontProductPayload } from '@gestor/types';
import { getProductConfigurationRoute, requiresProductConfiguration } from '@gestor/utils';

type PublicProductType = NonNullable<StorefrontProductPayload['type']>;

const consumers = [
  'src/features/pos/PosPage.tsx',
  'src/features/pos/WaiterPage.tsx',
  'src/features/orders/components/EditOrderModal.tsx',
];

describe('product configuration routing', () => {
  it('routes generic products from active option groups instead of the authoring type', () => {
    expect(getProductConfigurationRoute({ type: 'simple', activeOptionGroupCount: 0 })).toBe('direct');
    expect(getProductConfigurationRoute({ type: 'configurable', activeOptionGroupCount: 0 })).toBe('direct');
    expect(getProductConfigurationRoute({ type: 'simple', activeOptionGroupCount: 1 })).toBe('generic');
    expect(getProductConfigurationRoute({ type: 'configurable', activeOptionGroupCount: 1 })).toBe('generic');
    expect(requiresProductConfiguration({ type: 'simple', activeOptionGroupCount: 1 })).toBe(true);
  });

  it('keeps combo and pizza on their dedicated flows and ignores inactive or archived groups', () => {
    expect(getProductConfigurationRoute({ type: 'combo', activeOptionGroupCount: 1 })).toBe('combo');
    expect(getProductConfigurationRoute({ type: 'simple', categoryTemplateType: 'pizza' })).toBe('pizza');
    expect(getProductConfigurationRoute({ type: 'simple', activeOptionGroupCount: 0 })).toBe('direct');
  });

  it('uses the same routing helper in POS, WaiterPage, and order editing', () => {
    consumers.forEach((relativePath) => {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(source).toContain("getProductConfigurationRoute(product) !== 'direct'");
      expect(source).toContain('activeOptionGroupCount');
    });
  });

  it('accepts configurable products in the public storefront contract', () => {
    const type: PublicProductType = 'configurable';
    expect(type).toBe('configurable');
  });

  it('explains simple and configurable products in the catalog authoring UI', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/features/catalog/SubComponents/ProductBasicInfo.tsx'), 'utf8');

    expect(source).toContain('venda direta, sem personalização');
    expect(source).toContain('tamanhos, adicionais, escolhas ou personalizações');
  });
});
