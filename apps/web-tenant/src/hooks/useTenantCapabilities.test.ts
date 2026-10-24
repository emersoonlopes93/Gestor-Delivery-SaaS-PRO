import { describe, expect, it } from 'vitest';
import { resolveFeatureVisibility } from './useTenantCapabilities';

describe('Order Manager V2 capability visibility', () => {
  it('fails closed when the server capability response is absent', () => {
    expect(resolveFeatureVisibility('order_manager_v2', undefined, undefined)).toBe(false);
    expect(resolveFeatureVisibility(undefined, 'VITE_FEATURE_ORDER_MANAGER_V2', undefined)).toBe(false);
  });

  it('uses the server decision for enabled and disabled tenant overrides', () => {
    expect(resolveFeatureVisibility('order_manager_v2', undefined, {
      features: { order_manager_v2: { enabled: true, reason: 'tenant_enabled_override' } },
    })).toBe(true);
    expect(resolveFeatureVisibility('order_manager_v2', undefined, {
      features: { order_manager_v2: { enabled: false, reason: 'tenant_opt_in_required' } },
    })).toBe(false);
  });

  it('retains browser fallbacks for unrelated legacy feature keys', () => {
    expect(resolveFeatureVisibility(undefined, undefined, undefined)).toBe(true);
  });
});
