import {
  BarChart3, Bell, BookOpen, Box, Bot, Building2, CalendarClock, ChartLine, ChefHat,
  ClipboardList, CreditCard, Goal, Handshake, LayoutGrid, Link2, MapPin,
  Megaphone, MessageSquare, Package, Palette, Printer, QrCode, Settings,
  ShoppingCart, SlidersHorizontal, Smartphone, Ticket, Truck, Users, Wallet,
} from 'lucide-react';
import type { BreadcrumbMetadata, NavigationGroup, NavigationItem, SidebarNavigationGroup } from './navigation.types';

const item = (definition: Omit<NavigationItem, 'navigationKind'> & { navigationKind?: NavigationItem['navigationKind'] }): NavigationItem => ({
  navigationKind: 'SIDEBAR',
  ...definition,
});

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  item({ id: 'dashboard.overview', label: 'Hoje', path: '/dashboard', icon: LayoutGrid, permission: 'dashboard.view', match: (p) => p === '/dashboard' }),
  item({ id: 'billing.plan', label: 'Plano e Cobrança', path: '/billing', icon: CreditCard, permission: 'billing.read', match: (p) => p === '/billing' }),
  item({ id: 'billing.partners', label: 'Benefícios', path: '/partners', icon: Handshake, permission: 'billing.read', match: (p) => p === '/partners' }),
  item({ id: 'catalog.categories', label: 'Categorias', path: '/catalog/categories', icon: BookOpen, permission: 'catalog.read' }),
  item({ id: 'catalog.products', label: 'Cardápio', path: '/catalog/products', icon: Box, permission: 'catalog.read' }),
  item({ id: 'catalog.option-groups', label: 'Grupos de Opções', path: '/catalog/option-groups', icon: SlidersHorizontal, permission: 'catalog.manage_option_groups' }),
  item({ id: 'catalog.combos', label: 'Combos', path: '/catalog/combos', icon: Package, permission: 'catalog.manage_combos' }),
  item({ id: 'catalog.upsells', label: 'Upsells', path: '/catalog/upsells', icon: SlidersHorizontal, permission: 'catalog.read', featureFlag: 'VITE_FEATURE_UPSELLS', featureKey: 'upsells' }),
  item({ id: 'inventory.home', label: 'Estoque', path: '/inventory', icon: ClipboardList, permission: 'inventory.read', module: 'inventory', featureFlag: 'VITE_FEATURE_INVENTORY_ADVANCED' }),
  item({ id: 'orders.list', label: 'Pedidos', path: '/orders', icon: ClipboardList, permission: 'orders.read', match: (p) => p === '/orders' }),
  item({ id: 'orders.board', label: 'Kanban', path: '/orders/board', icon: BarChart3, permission: 'orders.use_kanban' }),
  item({ id: 'orders.kds', label: 'Cozinha (KDS)', path: '/orders/kds', icon: ChefHat, permission: 'kds.use', featureKey: 'kds' }),
  item({ id: 'orders.automation', label: 'Automação de Pedidos', path: '/orders/settings/automation', icon: Bot, permission: 'orders.settings.manage' }),
  item({ id: 'delivery.dispatch', label: 'Entregas', path: '/delivery/dispatch', icon: Truck, permission: 'delivery.read' }),
  item({ id: 'delivery.map', label: 'Mapa (Tempo Real)', path: '/delivery/map', icon: MapPin, permission: 'delivery.read', featureFlag: 'VITE_FEATURE_DELIVERY_LIVE_MAP', featureKey: 'delivery_live_map' }),
  item({ id: 'delivery.drivers', label: 'Entregadores', path: '/delivery/drivers', icon: Users, permission: 'delivery.manage_drivers' }),
  item({ id: 'delivery.zones', label: 'Zonas de Entrega', path: '/delivery/rates', icon: SlidersHorizontal, permission: 'delivery.manage' }),
  item({ id: 'pos.home', label: 'PDV', path: '/pos', icon: ShoppingCart, permission: 'pos.read' }),
  item({ id: 'pos.tables', label: 'Mesas', path: '/pos/tables', icon: QrCode, permission: 'pos.read', featureKey: 'dine_in' }),
  item({ id: 'pos.printers', label: 'Impressão', path: '/pos/printers', icon: Printer, permission: 'settings.manage', featureKey: 'printing' }),
  item({ id: 'cash.home', label: 'Caixa e Fechamento', path: '/cash', icon: Wallet, permission: 'cash.read', parentId: 'management.finance' }),
  item({ id: 'management.hub', label: 'Gestão', hubDescription: 'Acompanhe indicadores, metas, desempenho, análises e equipe.', path: '/management', icon: ChartLine }),
  item({ id: 'management.employees', label: 'Equipe', hubDescription: 'Gerencie funcionários e acessos da loja.', path: '/management/employees', icon: Users, permission: 'users.read', parentId: 'management.hub' }),
  item({ id: 'management.suppliers', label: 'Fornecedores', hubDescription: 'Organize fornecedores e dados de compra.', path: '/management/suppliers', icon: Truck, permission: 'purchasing.read', module: 'purchasing', parentId: 'inventory.home' }),
  item({ id: 'management.purchases', label: 'Compras', hubDescription: 'Registre entradas e reposições de insumos.', path: '/management/purchases', icon: ShoppingCart, permission: 'purchasing.read', module: 'purchasing', parentId: 'inventory.home' }),
  item({ id: 'management.finance', label: 'Financeiro', hubLabel: 'Visão', hubDescription: 'Acompanhe lançamentos e o resultado do negócio.', path: '/management/finance', icon: Wallet, permission: 'finance.read', module: 'finance', featureFlag: 'VITE_FEATURE_FINANCE_ADVANCED' }),
  item({ id: 'channels.hub', label: 'Canais e Relacionamento', path: '/channels', icon: Link2, permission: 'orders.read' }),
  item({ id: 'crm.customers', label: 'Clientes', hubDescription: 'Acompanhe clientes e seu histórico de pedidos.', path: '/customers', icon: Users, permission: 'crm.read', module: 'crm', parentId: 'channels.hub' }),
  item({ id: 'crm.dashboard', label: 'CRM Avançado', hubDescription: 'Analise a base de clientes e oportunidades.', path: '/crm/dashboard', icon: ChartLine, permission: 'crm.read', featureFlag: 'VITE_FEATURE_CRM_ADVANCED', featureKey: 'crm_enterprise', parentId: 'channels.hub' }),
  item({ id: 'marketing.automations', label: 'Automações', hubDescription: 'Defina jornadas automáticas de relacionamento.', path: '/marketing/automations', icon: Bot, permission: 'crm.read', featureFlag: 'VITE_FEATURE_CAMPAIGNS', featureKey: 'campaigns', parentId: 'channels.hub' }),
  item({ id: 'crm.promotions', label: 'Promoções & Cupons', hubLabel: 'Promoções', hubDescription: 'Crie cupons e ações promocionais para clientes.', path: '/promotions', icon: Ticket, permission: 'crm.manage_coupons', module: 'crm', parentId: 'channels.hub' }),
  item({ id: 'analytics.reports', label: 'Relatórios', hubDescription: 'Analise vendas, pedidos, produtos e desempenho.', path: '/analytics/reports', icon: ChartLine, permission: 'reports.read', module: 'reports', parentId: 'management.hub' }),
  item({ id: 'analytics.performance-legacy', label: 'Relatórios', path: '/analytics/performance', navigationKind: 'VALID_HIDDEN', parentId: 'management.hub' }),
  item({ id: 'analytics.bi', label: 'BI Avançado', hubDescription: 'Explore análises detalhadas do negócio.', path: '/analytics/business-intelligence', icon: BarChart3, permission: 'reports.read', featureFlag: 'VITE_FEATURE_BI_ADVANCED', featureKey: 'bi_advanced', parentId: 'management.hub' }),
  item({ id: 'analytics.goals', label: 'Metas', hubDescription: 'Veja objetivos e o progresso da loja.', path: '/analytics/goals', icon: Goal, permission: 'goals.read', featureFlag: 'VITE_FEATURE_GOALS', featureKey: 'goals', parentId: 'management.hub' }),
  item({ id: 'whatsapp.inbox', label: 'WhatsApp', hubDescription: 'Atenda conversas e pedidos pelo WhatsApp.', path: '/whatsapp/inbox', icon: MessageSquare, permission: 'chat.read', featureFlag: 'VITE_FEATURE_WHATSAPP_ADVANCED', featureKey: 'whatsapp_advanced', parentId: 'channels.hub' }),
  item({ id: 'campaigns.home', label: 'Campanhas', hubDescription: 'Planeje campanhas para engajar clientes.', path: '/campaigns', icon: Megaphone, permission: 'crm.manage_coupons', featureFlag: 'VITE_FEATURE_CAMPAIGNS', featureKey: 'campaigns', parentId: 'channels.hub' }),
  item({ id: 'whatsapp.config', label: 'Configurar WhatsApp', hubDescription: 'Configure o canal de atendimento por WhatsApp.', path: '/whatsapp/config', icon: Smartphone, permission: 'settings.manage', featureFlag: 'VITE_FEATURE_WHATSAPP_CONNECT', featureKey: 'whatsapp_connect', parentId: 'channels.hub' }),
  item({ id: 'settings.home', label: 'Configurações da Loja', path: '/settings', icon: Settings, permission: 'settings.manage' }),
  item({ id: 'settings.network', label: 'Rede de Lojas', path: '/settings/network', icon: Building2, permission: 'settings.manage' }),
  item({ id: 'settings.integrations', label: 'Marketplaces', hubDescription: 'Gerencie integrações com marketplaces.', path: '/settings/integrations', icon: Link2, permission: 'settings.manage', featureKey: 'marketplace_orders', parentId: 'channels.hub', match: (p) => p === '/settings/integrations' }),
  item({ id: 'settings.storefront', label: 'Loja Própria', hubDescription: 'Configure o cardápio público da sua loja.', path: '/settings/storefront', icon: Palette, permission: 'settings.manage', parentId: 'channels.hub' }),
  item({ id: 'settings.scheduling', label: 'Agendamentos', path: '/settings/scheduling', icon: CalendarClock, permission: 'settings.manage', featureKey: 'scheduling' }),
  item({ id: 'settings.notifications', label: 'Notificações', path: '/settings/notifications', icon: Bell, permission: 'settings.manage' }),
  item({ id: 'catalog.product-editor', label: 'Editar Produto', path: '/catalog/products/:id/v2', navigationKind: 'CONTEXTUAL', parentId: 'catalog.products' }),
  item({ id: 'catalog.product-create', label: 'Novo Produto', path: '/catalog/products/new/v2', navigationKind: 'CONTEXTUAL', parentId: 'catalog.products' }),
  item({ id: 'catalog.combo-editor', label: 'Editar Combo', path: '/catalog/combos/:id/v2', navigationKind: 'CONTEXTUAL', parentId: 'catalog.combos' }),
  item({ id: 'catalog.combo-create', label: 'Novo Combo', path: '/catalog/combos/new/v2', navigationKind: 'CONTEXTUAL', parentId: 'catalog.combos' }),
  item({ id: 'catalog.simulation', label: 'Simulação de Pedido', path: '/catalog/simulation', navigationKind: 'DEEP_LINK', parentId: 'catalog.products' }),
  item({ id: 'pos.waiter', label: 'Modo Garçom', path: '/waiter', navigationKind: 'DEEP_LINK', parentId: 'pos.home' }),
  item({ id: 'settings.qr-codes', label: 'QR Code', path: '/settings/qr-codes', navigationKind: 'VALID_HIDDEN', parentId: 'settings.home' }),
  item({ id: 'settings.menu-import', label: 'Importar Cardápio', path: '/settings/menu-import', navigationKind: 'CONTEXTUAL', parentId: 'catalog.products' }),
  item({ id: 'onboarding', label: 'Onboarding', path: '/onboarding', navigationKind: 'VALID_HIDDEN' }),
];

export const NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  { id: 'operations', label: 'Operação', itemIds: ['dashboard.overview', 'orders.list', 'orders.board', 'orders.kds', 'pos.home', 'pos.tables', 'cash.home', 'delivery.dispatch', 'delivery.map', 'delivery.drivers', 'delivery.zones'] },
  { id: 'catalog-production', label: 'Cardápio e Produção', itemIds: ['catalog.products', 'catalog.categories', 'catalog.option-groups', 'catalog.combos', 'catalog.upsells', 'inventory.home'] },
  { id: 'finance', label: 'Financeiro', itemIds: ['management.finance'] },
  { id: 'management', label: 'Gestão', itemIds: ['management.hub'] },
  { id: 'channels', label: 'Canais e Relacionamento', itemIds: ['channels.hub'] },
  { id: 'settings', label: 'Configurações', itemIds: ['settings.home', 'settings.network', 'settings.notifications', 'settings.scheduling', 'pos.printers', 'orders.automation', 'billing.plan', 'billing.partners'] },
];

const itemsById = new Map(NAVIGATION_ITEMS.map((entry) => [entry.id, entry]));

export function getNavigationItem(pathname: string): NavigationItem | undefined {
  return NAVIGATION_ITEMS.find((entry) => entry.navigationKind !== 'SIDEBAR' && !entry.path.includes(':') && matchNavigationItem(entry, pathname))
    ?? NAVIGATION_ITEMS.find((entry) => entry.navigationKind !== 'SIDEBAR' && matchNavigationItem(entry, pathname))
    ?? NAVIGATION_ITEMS
      .filter((entry) => matchNavigationItem(entry, pathname))
      .sort((left, right) => right.path.length - left.path.length)[0];
}

export function getNavigationItems(itemIds: readonly string[]): readonly NavigationItem[] {
  return itemIds.flatMap((id) => {
    const entry = itemsById.get(id);
    return entry ? [entry] : [];
  });
}

export function filterNavigationItems(
  items: readonly NavigationItem[],
  isFeatureVisible: (featureFlag?: string, featureKey?: string) => boolean,
  hasPermission: (permission?: string) => boolean,
  hasModule: (module?: string) => boolean,
): readonly NavigationItem[] {
  return items.filter((entry) => (
    isFeatureVisible(entry.featureFlag, entry.featureKey)
    && hasPermission(entry.permission)
    && hasModule(entry.module)
  ));
}

export function matchNavigationItem(entry: NavigationItem, pathname: string): boolean {
  if (entry.match) return entry.match(pathname);
  const pattern = entry.path.replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${pattern}$`).test(pathname) || (entry.navigationKind === 'SIDEBAR' && pathname.startsWith(`${entry.path}/`));
}

export function getBreadcrumbMetadata(pathname: string): BreadcrumbMetadata {
  const entry = getNavigationItem(pathname);
  if (!entry) return { label: pathname.split('/').filter(Boolean).at(-1)?.replace(/-/g, ' ') || 'Dashboard' };
  const parent = entry.parentId ? itemsById.get(entry.parentId) : undefined;
  if (parent) return { parentLabel: parent.label, label: entry.breadcrumbLabel ?? entry.label };
  const group = NAVIGATION_GROUPS.find((candidate) => candidate.itemIds.includes(entry.id));
  return group && group.id !== 'operations' && group.id !== 'settings' && group.label !== entry.label
    ? { parentLabel: group.label, label: entry.label }
    : { label: entry.label };
}

export function getSidebarNavigation(): readonly SidebarNavigationGroup[] {
  return NAVIGATION_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.itemIds.map((id) => {
      const entry = itemsById.get(id);
      if (!entry?.icon) throw new Error(`Sidebar navigation item ${id} is missing`);
      return { id: entry.id, label: entry.label, to: entry.path, icon: entry.icon, permission: entry.permission, featureFlag: entry.featureFlag, featureKey: entry.featureKey, match: entry.match };
    }),
  }));
}

export function filterSidebarNavigation(
  groups: readonly SidebarNavigationGroup[],
  isFeatureVisible: (featureFlag?: string, featureKey?: string) => boolean,
  hasPermission: (permission?: string) => boolean,
): readonly SidebarNavigationGroup[] {
  return groups.flatMap((group) => {
    const items = group.items.filter((entry) => isFeatureVisible(entry.featureFlag, entry.featureKey) && hasPermission(entry.permission));
    return items.length ? [{ ...group, items }] : [];
  });
}
