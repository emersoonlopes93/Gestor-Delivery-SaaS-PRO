import {
  filterSidebarNavigation,
  getBreadcrumbMetadata,
  getNavigationItem,
  getSidebarNavigation,
  NAVIGATION_GROUPS,
  NAVIGATION_ITEMS,
} from './navigationRegistry';

describe('navigation registry', () => {
  it('projects the six manager-workflow groups without changing visible item identity', () => {
    const sidebar = getSidebarNavigation();
    expect(sidebar).toHaveLength(6);
    expect(sidebar.flatMap((group) => group.items)).toHaveLength(42);
    expect(NAVIGATION_ITEMS.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      'dashboard.overview', 'orders.kds', 'inventory.home', 'management.purchases', 'analytics.reports', 'settings.integrations',
    ]));
    expect(NAVIGATION_GROUPS.map((group) => group.id)).toEqual(['operations', 'catalog-production', 'finance', 'management', 'channels', 'settings']);
    expect(sidebar.map((group) => group.label)).toEqual(['Operação', 'Cardápio e Produção', 'Financeiro', 'Gestão', 'Canais e Relacionamento', 'Configurações']);
  });

  it('keeps the current guards and filters sidebar entries without changing their order', () => {
    const filtered = filterSidebarNavigation(getSidebarNavigation(), (_flag, key) => key !== 'kds', (permission) => permission !== 'billing.read');
    expect(filtered.find((group) => group.id === 'settings')?.items.map((entry) => entry.id)).not.toContain('billing.plan');
    expect(filtered.find((group) => group.id === 'operations')?.items.map((entry) => entry.id)).not.toContain('orders.kds');
  });

  it('preserves representative permission and feature contracts used by desktop and mobile sidebar projection', () => {
    const byId = new Map(NAVIGATION_ITEMS.map((entry) => [entry.id, entry]));
    expect(byId.get('orders.kds')).toMatchObject({ permission: 'kds.use', featureKey: 'kds' });
    expect(byId.get('analytics.bi')).toMatchObject({ permission: 'reports.read', featureKey: 'bi_advanced' });
    expect(byId.get('analytics.goals')).toMatchObject({ permission: 'goals.read', featureKey: 'goals' });
    expect(byId.get('campaigns.home')).toMatchObject({ permission: 'crm.manage_coupons', featureKey: 'campaigns' });
    expect(byId.get('whatsapp.inbox')).toMatchObject({ permission: 'orders.read', featureKey: 'whatsapp_advanced' });
    expect(byId.get('settings.integrations')).toMatchObject({ permission: 'settings.manage', featureKey: 'ifood_marketplace' });
    expect(byId.get('pos.tables')).toMatchObject({ permission: 'pos.read', featureKey: 'dine_in' });
    expect(byId.get('pos.printers')).toMatchObject({ permission: 'settings.manage', featureKey: 'printing' });
    expect(byId.get('settings.scheduling')).toMatchObject({ permission: 'settings.manage', featureKey: 'scheduling' });
  });

  it('resolves contextual dynamic routes before their sidebar parent', () => {
    expect(getNavigationItem('/catalog/products/abc-123/v2')?.id).toBe('catalog.product-editor');
    expect(getNavigationItem('/catalog/combos/new/v2')?.id).toBe('catalog.combo-create');
    expect(getBreadcrumbMetadata('/catalog/products/abc-123/v2')).toEqual({ parentLabel: 'Cardápio', label: 'Editar Produto' });
  });

  it('resolves deep links and valid hidden routes without a sidebar entry', () => {
    expect(getNavigationItem('/catalog/simulation')?.navigationKind).toBe('DEEP_LINK');
    expect(getNavigationItem('/settings/qr-codes')?.navigationKind).toBe('VALID_HIDDEN');
    expect(getBreadcrumbMetadata('/settings/qr-codes')).toEqual({ parentLabel: 'Configurações da Loja', label: 'QR Code' });
  });
});
