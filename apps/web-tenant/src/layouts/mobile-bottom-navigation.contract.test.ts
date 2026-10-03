import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'AppLayout.tsx'), 'utf8');

describe('Mobile bottom navigation contract', () => {
  it('keeps the bottom navigation mobile-only and leaves the desktop sidebar intact', () => {
    expect(source).toContain('Navegação principal mobile');
    expect(source).toContain('md:hidden');
    expect(source).toContain('md:pb-0');
    expect(source).toContain('hidden flex-col');
    expect(source).toContain('md:static md:flex');
    expect(source).not.toContain("isMobileOpen ? 'translate-x-0'");
  });

  it('reuses existing operational routes and opens a mobile-only More sheet', () => {
    expect(source).toContain("to: '/orders/manager'");
    expect(source).toContain("to: '/orders'");
    expect(source).toContain("to: '/management/finance'");
    expect(source).toContain("to: '/customers'");
    expect(source).toContain('onOpenMore={openMobile}');
    expect(source).toContain('<MobileMoreSheet groups={groups}');
    expect(source).toContain('Mais opções de navegação');
  });

  it('does not expose a shortcut without its existing feature and permission gate', () => {
    expect(source).toContain("isFeatureVisible?.(undefined, 'order_manager_v2')");
    expect(source).toContain("hasPermission(userPermissions, 'orders.use_kanban')");
    expect(source).toContain("hasPermission(userPermissions, 'finance.read')");
    expect(source).toContain("hasPermission(userPermissions, 'crm.read')");
    expect(source).toContain("location.pathname === '/orders/manager' ? 'hidden' : ''");
  });
});
