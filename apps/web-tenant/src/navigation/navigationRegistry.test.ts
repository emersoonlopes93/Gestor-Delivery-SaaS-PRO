import {
  filterSidebarNavigation,
  getActiveSidebarGroupId,
  getBreadcrumbMetadata,
  getNavigationItem,
  getNavigationItems,
  getSidebarNavigation,
  filterNavigationItems,
  NAVIGATION_GROUPS,
  NAVIGATION_ITEMS,
} from './navigationRegistry';

describe('navigation registry', () => {
  it('projects the six manager-workflow groups through the navigation hubs', () => {
    const sidebar = getSidebarNavigation();
    expect(sidebar).toHaveLength(6);
    expect(sidebar.flatMap((group) => group.items)).toHaveLength(29);
    expect(NAVIGATION_ITEMS.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      'dashboard.overview', 'orders.kds', 'inventory.home', 'management.purchases', 'analytics.reports', 'settings.integrations', 'channels.hub', 'management.hub',
    ]));
    expect(NAVIGATION_GROUPS.map((group) => group.id)).toEqual(['operations', 'catalog-production', 'finance', 'management', 'channels', 'settings']);
    expect(sidebar.map((group) => group.label)).toEqual(['Operação', 'Cardápio e Produção', 'Financeiro', 'Gestão', 'Canais e Relacionamento', 'Configurações']);
    expect(sidebar.find((group) => group.id === 'operations')?.items.map((entry) => entry.id)).toContain('cash.home');
    expect(sidebar.find((group) => group.id === 'finance')?.items.map((entry) => entry.id)).toEqual(['management.finance']);
    expect(sidebar.find((group) => group.id === 'catalog-production')?.items.map((entry) => entry.id)).not.toEqual(expect.arrayContaining(['management.purchases', 'management.suppliers']));
    expect(sidebar.find((group) => group.id === 'channels')?.items.map((entry) => entry.id)).toEqual(['channels.hub']);
    expect(sidebar.find((group) => group.id === 'management')?.items.map((entry) => entry.id)).toEqual(['management.hub']);
  });

  it('keeps the current guards and filters sidebar entries without changing their order', () => {
    const filtered = filterSidebarNavigation(getSidebarNavigation(), (_flag, key) => key !== 'kds', (permission) => permission !== 'billing.read', () => true);
    expect(filtered.find((group) => group.id === 'settings')?.items.map((entry) => entry.id)).not.toContain('billing.plan');
    expect(filtered.find((group) => group.id === 'operations')?.items.map((entry) => entry.id)).not.toContain('orders.kds');
  });

  it('preserves representative permission and feature contracts used by desktop and mobile sidebar projection', () => {
    const byId = new Map(NAVIGATION_ITEMS.map((entry) => [entry.id, entry]));
    expect(byId.get('orders.kds')).toMatchObject({ permission: 'kds.use', featureKey: 'kds' });
    expect(byId.get('orders.manager')).toMatchObject({ permission: 'orders.use_kanban', featureKey: 'order_manager_v2' });
    expect(byId.get('analytics.bi')).toMatchObject({ permission: 'reports.read', featureKey: 'bi_advanced' });
    expect(byId.get('analytics.goals')).toMatchObject({ permission: 'goals.read', featureKey: 'goals' });
    expect(byId.get('campaigns.home')).toMatchObject({ permission: 'crm.manage_coupons', featureKey: 'campaigns' });
    expect(byId.get('whatsapp.inbox')).toMatchObject({ permission: 'chat.read', featureKey: 'whatsapp_advanced' });
    expect(byId.get('settings.integrations')).toMatchObject({ permission: 'settings.manage', featureKey: 'marketplace_orders' });
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

  it('resolves hub parents for retained child routes', () => {
    expect(getBreadcrumbMetadata('/cash')).toEqual({ parentLabel: 'Financeiro', label: 'Caixa e Fechamento' });
    expect(getBreadcrumbMetadata('/management/purchases')).toEqual({ parentLabel: 'Estoque', label: 'Compras' });
    expect(getBreadcrumbMetadata('/settings/integrations')).toEqual({ parentLabel: 'Canais e Relacionamento', label: 'Marketplaces' });
  });

  it('keeps hub card entries subject to their original permission and feature metadata', () => {
    const byId = new Map(NAVIGATION_ITEMS.map((entry) => [entry.id, entry]));
    expect(byId.get('channels.hub')).toMatchObject({ path: '/channels', childAccessItemIds: expect.arrayContaining(['crm.customers', 'whatsapp.inbox']) });
    expect(byId.get('management.hub')).toMatchObject({ path: '/management' });
    expect(byId.get('analytics.reports')).toMatchObject({
      path: '/analytics/reports',
      permission: 'reports.read',
      module: 'reports',
      parentId: 'management.finance',
    });
    expect(byId.get('analytics.goals')).toMatchObject({ permission: 'goals.read', featureKey: 'goals', parentId: 'management.hub' });
    expect(byId.get('analytics.bi')).toMatchObject({ permission: 'reports.read', featureKey: 'bi_advanced', parentId: 'management.hub' });
    expect(byId.get('analytics.performance')).toMatchObject({ permission: 'reports.read', module: 'reports', parentId: 'management.hub' });
    expect(byId.get('management.employees')).toMatchObject({ permission: 'users.read', parentId: 'management.hub' });
    expect(byId.get('settings.integrations')).toMatchObject({ permission: 'settings.manage', featureKey: 'marketplace_orders', parentId: 'channels.hub' });
    expect(byId.get('management.purchases')).toMatchObject({ permission: 'purchasing.read', module: 'purchasing', parentId: 'inventory.home' });
    expect(byId.get('whatsapp.config')).toMatchObject({ permission: 'settings.manage', featureKey: 'whatsapp_connect', parentId: 'channels.hub' });
    expect(byId.get('settings.storefront')?.hubDescription).toBe('Configure o cardápio público da sua loja.');
    expect(byId.get('settings.integrations')?.hubDescription).toBe('Gerencie integrações com marketplaces.');
  });

  it('filters hub destinations with the same permission, feature and module requirements as their routes', () => {
    const channels = getNavigationItems(['settings.integrations', 'whatsapp.inbox', 'crm.customers']);
    const visible = filterNavigationItems(
      channels,
      (_flag, key) => key !== 'ifood_marketplace',
      (permission) => permission !== 'crm.read',
      (module) => module !== 'crm',
    );

    expect(visible.map((entry) => entry.id)).toEqual(['settings.integrations', 'whatsapp.inbox']);
  });

  it('keeps route context ahead of saved sidebar state and respects module access', () => {
    const sidebar = getSidebarNavigation();
    expect(getActiveSidebarGroupId('/management/finance', sidebar)).toBe('finance');
    expect(getActiveSidebarGroupId('/analytics/reports', sidebar)).toBe('finance');
    expect(getActiveSidebarGroupId('/analytics/goals', sidebar)).toBe('management');
    expect(getActiveSidebarGroupId('/analytics/performance', sidebar)).toBe('management');
    expect(getActiveSidebarGroupId('/customers', sidebar)).toBe('channels');
    expect(getActiveSidebarGroupId('/campaigns', sidebar)).toBe('channels');
    expect(getActiveSidebarGroupId('/promotions', sidebar)).toBe('channels');

    const visible = filterSidebarNavigation(
      sidebar,
      () => true,
      () => true,
      (module) => module !== 'inventory' && module !== 'finance',
    );
    expect(visible.find((group) => group.id === 'catalog-production')?.items.map((item) => item.id)).not.toContain('inventory.home');
    expect(visible.map((group) => group.id)).not.toContain('finance');
  });

  it('exposes Channels when a child destination is authorized without orders.read', () => {
    const visible = filterSidebarNavigation(
      getSidebarNavigation(),
      () => true,
      (permission) => permission === 'crm.read',
      () => true,
    );
    expect(visible.find((group) => group.id === 'channels')?.items.map((item) => item.id)).toEqual(['channels.hub']);
  });

  it('keeps the management landing functional for partial access and preserves old route metadata', () => {
    const management = getNavigationItems(['analytics.goals', 'analytics.performance', 'analytics.bi', 'management.employees']);
    const visible = filterNavigationItems(
      management,
      (_flag, key) => key !== 'goals' && key !== 'bi_advanced',
      (permission) => permission === 'reports.read',
      () => true,
    );

    expect(visible.map((entry) => entry.id)).toEqual(['analytics.performance']);
    expect(getNavigationItem('/management')?.id).toBe('management.hub');
    expect(getNavigationItem('/analytics/goals')?.id).toBe('analytics.goals');
    expect(getNavigationItem('/analytics/performance')?.id).toBe('analytics.performance');
    expect(getNavigationItem('/analytics/business-intelligence')?.id).toBe('analytics.bi');
    expect(getNavigationItem('/management/employees')?.id).toBe('management.employees');
    expect(getNavigationItem('/analytics/reports')?.id).toBe('analytics.reports');
    expect(getBreadcrumbMetadata('/analytics/reports')).toEqual({ parentLabel: 'Financeiro', label: 'Relatórios Financeiros' });
    expect(getBreadcrumbMetadata('/analytics/goals')).toEqual({ parentLabel: 'Gestão', label: 'Metas' });
    expect(getBreadcrumbMetadata('/analytics/performance')).toEqual({ parentLabel: 'Gestão', label: 'Desempenho de Vendas' });
    expect(getBreadcrumbMetadata('/analytics/business-intelligence')).toEqual({ parentLabel: 'Gestão', label: 'BI Avançado' });
    expect(getBreadcrumbMetadata('/management/employees')).toEqual({ parentLabel: 'Gestão', label: 'Equipe' });
  });
});
