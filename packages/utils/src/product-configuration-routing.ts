import type { CatalogProductType, CategoryTemplateType } from '@gestor/types';

export type ProductConfigurationRoute = 'direct' | 'generic' | 'pizza' | 'combo';

export interface ProductConfigurationRoutingInput {
  type?: CatalogProductType | null;
  activeOptionGroupCount?: number | null;
  categoryTemplateType?: CategoryTemplateType | null;
}

/**
 * Generic products require configuration from their effective catalog links,
 * not from the authoring label (`simple` or `configurable`).
 */
export function requiresProductConfiguration(input: ProductConfigurationRoutingInput): boolean {
  return input.type !== 'combo' && (input.activeOptionGroupCount ?? 0) > 0;
}

/**
 * Chooses the product-entry flow shared by POS and order editing.
 * Combo and Pizza retain their own domain flows; generic options use the
 * canonical link-based decision above.
 */
export function getProductConfigurationRoute(input: ProductConfigurationRoutingInput): ProductConfigurationRoute {
  if (input.type === 'combo') return 'combo';
  if (input.categoryTemplateType === 'pizza') return 'pizza';
  return requiresProductConfiguration(input) ? 'generic' : 'direct';
}
