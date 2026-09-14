import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'AppLayout.tsx'), 'utf8');

describe('Mobile bottom navigation contract', () => {
  it('keeps the navigation mobile-only and leaves desktop navigation intact', () => {
    expect(source).toContain('Navegação principal mobile');
    expect(source).toContain('md:hidden');
    expect(source).toContain('md:pb-0');
    expect(source).toContain('<aside');
  });

  it('reuses existing operational routes and opens the existing drawer for More', () => {
    expect(source).toContain("to: '/orders/manager'");
    expect(source).toContain("to: '/orders'");
    expect(source).toContain("to: '/orders/kds'");
    expect(source).toContain("to: '/delivery/dispatch'");
    expect(source).toContain('onOpenMore={openMobile}');
  });

  it('does not expose a shortcut without its existing feature and permission gate', () => {
    expect(source).toContain("isFeatureVisible?.(undefined, 'order_manager_v2')");
    expect(source).toContain("hasPermission(userPermissions, 'orders.use_kanban')");
    expect(source).toContain("isFeatureVisible?.(undefined, 'kds')");
    expect(source).toContain("hasPermission(userPermissions, 'kds.use')");
    expect(source).toContain("hasPermission(userPermissions, 'delivery.read')");
  });
});
