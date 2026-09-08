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
  item({ id: 'cash.home', label: 'Caixa e Fechamento', path: '/cash', icon: Wallet, permission: 'cash.read' }),
  item({ id: 'management.employees', label: 'Equipe', path: '/management/employees', icon: Users, permission: 'users.read' }),
  item({ id: 'management.suppliers', label: 'Fornecedores', path: '/management/suppliers', icon: Truck, permission: 'purchasing.read', module: 'purchasing' }),
  item({ id: 'management.purchases', label: 'Compras', path: '/management/purchases', icon: ShoppingCart, permission: 'purchasing.read', module: 'purchasing' }),
  item({ id: 'management.finance', label: 'Visão Financeira', path: '/management/finance', icon: Wallet, permission: 'finance.read', module: 'finance', featureFlag: 'VITE_FEATURE_FINANCE_ADVANCED' }),
  item({ id: 'crm.customers', label: 'Clientes', path: '/customers', icon: Users, permission: 'crm.read', module: 'crm' }),
  item({ id: 'crm.dashboard', label: 'CRM Avançado', path: '/crm/dashboard', icon: ChartLine, permission: 'crm.read', featureFlag: 'VITE_FEATURE_CRM_ADVANCED', featureKey: 'crm_enterprise' }),
  item({ id: 'marketing.automations', label: 'Automações', path: '/marketing/automations', icon: Bot, permission: 'crm.read', featureFlag: 'VITE_FEATURE_CAMPAIGNS', featureKey: 'campaigns' }),
  item({ id: 'crm.promotions', label: 'Promoções & Cupons', path: '/promotions', icon: Ticket, permission: 'crm.manage_coupons', module: 'crm' }),
  item({ id: 'analytics.reports', label: 'Relatórios Financeiros', path: '/analytics/reports', icon: ChartLine, permission: 'reports.read', module: 'reports' }),
  item({ id: 'analytics.bi', label: 'BI Avançado', path: '/analytics/business-intelligence', icon: BarChart3, permission: 'reports.read', featureFlag: 'VITE_FEATURE_BI_ADVANCED', featureKey: 'bi_advanced' }),
  item({ id: 'analytics.performance', label: 'Desempenho de Vendas', path: '/analytics/performance', icon: BarChart3, permission: 'reports.read', module: 'reports', match: (p) => p === '/analytics/performance' }),
  item({ id: 'analytics.goals', label: 'Metas', path: '/analytics/goals', icon: Goal, permission: 'goals.read', featureFlag: 'VITE_FEATURE_GOALS', featureKey: 'goals' }),
  item({ id: 'whatsapp.inbox', label: 'WhatsApp', path: '/whatsapp/inbox', icon: MessageSquare, permission: 'orders.read', featureFlag: 'VITE_FEATURE_WHATSAPP_ADVANCED', featureKey: 'whatsapp_advanced' }),
  item({ id: 'campaigns.home', label: 'Campanhas', path: '/campaigns', icon: Megaphone, permission: 'crm.manage_coupons', featureFlag: 'VITE_FEATURE_CAMPAIGNS', featureKey: 'campaigns' }),
  item({ id: 'whatsapp.config', label: 'Configurar WhatsApp', path: '/whatsapp/config', icon: Smartphone, permission: 'settings.manage', featureFlag: 'VITE_FEATURE_WHATSAPP_CONNECT', featureKey: 'whatsapp_connect' }),
  item({ id: 'settings.home', label: 'Configurações da Loja', path: '/settings', icon: Settings, permission: 'settings.manage' }),
  item({ id: 'settings.network', label: 'Rede de Lojas', path: '/settings/network', icon: Building2, permission: 'settings.manage' }),
  item({ id: 'settings.integrations', label: 'Marketplaces', path: '/settings/integrations', icon: Link2, permission: 'settings.manage', featureKey: 'ifood_marketplace', match: (p) => p === '/settings/integrations' }),
  item({ id: 'settings.storefront', label: 'Loja Própria', path: '/settings/storefront', icon: Palette, permission: 'settings.manage' }),
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
  { id: 'catalog-production', label: 'Cardápio e Produção', itemIds: ['catalog.products', 'catalog.categories', 'catalog.option-groups', 'catalog.combos', 'catalog.upsells', 'inventory.home', 'management.purchases', 'management.suppliers'] },
  { id: 'finance', label: 'Financeiro', itemIds: ['management.finance', 'analytics.reports'] },
  { id: 'management', label: 'Gestão', itemIds: ['analytics.goals', 'analytics.performance', 'analytics.bi', 'management.employees'] },
  { id: 'channels', label: 'Canais e Relacionamento', itemIds: ['crm.customers', 'crm.dashboard', 'crm.promotions', 'campaigns.home', 'marketing.automations', 'whatsapp.inbox', 'whatsapp.config', 'settings.storefront', 'settings.integrations'] },
  { id: 'settings', label: 'Configurações', itemIds: ['settings.home', 'settings.network', 'settings.notifications', 'settings.scheduling', 'pos.printers', 'orders.automation', 'billing.plan', 'billing.partners'] },
];

const itemsById = new Map(NAVIGATION_ITEMS.map((entry) => [entry.id, entry]));

export function getNavigationItem(pathname: string): NavigationItem | undefined {
  return NAVIGATION_ITEMS.find((entry) => entry.navigationKind !== 'SIDEBAR' && !entry.path.includes(':') && matchNavigationItem(entry, pathname))
    ?? NAVIGATION_ITEMS.find((entry) => entry.navigationKind !== 'SIDEBAR' && matchNavigationItem(entry, pathname))
    ?? NAVIGATION_ITEMS.find((entry) => matchNavigationItem(entry, pathname));
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
  return group && group.id !== 'operations' && group.id !== 'settings'
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
