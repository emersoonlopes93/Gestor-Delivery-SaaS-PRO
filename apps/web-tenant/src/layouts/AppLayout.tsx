import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasPermission } from '@gestor/auth';
import {
  BarChart3,
  BookOpen,
  Box,
  ChartLine,
  ChefHat,
  ClipboardList,
  Goal,
  LayoutGrid,
  MapPin,
  Menu,
  Package,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Ticket,
  Truck,
  Users,
  Wallet,
  Bell,
  UserCircle,
  ChevronRight,
  CornerDownRight,
  Copy,
  ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';

type SidebarItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: string;
  isExternal?: boolean;
  match?: (pathname: string) => boolean;
};

type SidebarGroup = {
  id: string;
  label: string;
  items: readonly SidebarItem[];
};

const SIDEBAR_STORAGE_KEY = 'tenant_sidebar_state_v1';

const SIDEBAR_GROUPS: readonly SidebarGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    items: [
      {
        id: 'dashboard-overview',
        label: 'Visão Geral',
        to: '/dashboard',
        icon: LayoutGrid,
        permission: 'dashboard.view',
        match: (p) => p === '/dashboard',
      },
    ],
  },
  {
    id: 'catalog',
    label: 'Cardápio',
    items: [
      { id: 'catalog-categories', label: 'Categorias', to: '/catalog/categories', icon: BookOpen, permission: 'catalog.read' },
      { id: 'catalog-products', label: 'Produtos', to: '/catalog/products', icon: Box, permission: 'catalog.read' },
      { id: 'catalog-complements', label: 'Grupos e Tamanhos', to: '/catalog/complements', icon: SlidersHorizontal, permission: 'catalog.manage_option_groups' },
      { id: 'catalog-combos', label: 'Combos', to: '/catalog/combos', icon: Package, permission: 'catalog.manage_combos' },
      { id: 'catalog-upsells', label: 'Upsells', to: '/catalog/upsells', icon: SlidersHorizontal, permission: 'catalog.read' },
      { id: 'catalog-inventory', label: 'Estoque & Ficha Técnica', to: '/inventory', icon: ClipboardList, permission: 'inventory.read' },
    ],
  },
  {
    id: 'orders',
    label: 'Pedidos',
    items: [
      { id: 'orders-list', label: 'Lista de Pedidos', to: '/orders', icon: ClipboardList, permission: 'orders.read', match: (p) => p === '/orders' },
      { id: 'orders-board', label: 'Kanban Operacional', to: '/orders/board', icon: BarChart3, permission: 'orders.use_kanban' },
      { id: 'orders-kds', label: 'KDS (Cozinha)', to: '/orders/kds', icon: ChefHat, permission: 'kds.use' },
    ],
  },
  {
    id: 'delivery',
    label: 'Logística',
    items: [
      { id: 'delivery-dispatch', label: 'Despacho Em Tempo Real', to: '/delivery/dispatch', icon: Truck, permission: 'delivery.read' },
      { id: 'delivery-map', label: 'Mapa (Tempo Real)', to: '/delivery/map', icon: MapPin, permission: 'delivery.read' },
      { id: 'delivery-drivers', label: 'Entregadores', to: '/delivery/drivers', icon: Users, permission: 'delivery.manage_drivers' },
      { id: 'delivery-zones', label: 'Zonas de Entrega', to: '/delivery/rates', icon: SlidersHorizontal, permission: 'delivery.manage' },
    ],
  },
  {
    id: 'pos',
    label: 'PDV e Caixa',
    items: [
      { id: 'pos', label: 'Ponto de Venda', to: '/pos', icon: ShoppingCart, permission: 'pos.read' },
      { id: 'cash', label: 'Caixa', to: '/cash', icon: Wallet, permission: 'cash.read' },
    ],
  },
  {
    id: 'management',
    label: 'Gestão',
    items: [
      { id: 'management-employees', label: 'Funcionários', to: '/management/employees', icon: Users, permission: 'users.read' },
      { id: 'management-suppliers', label: 'Fornecedores', to: '/management/suppliers', icon: Truck, permission: 'purchasing.read' },
      { id: 'management-purchases', label: 'Compras / Entradas', to: '/management/purchases', icon: ShoppingCart, permission: 'purchasing.read' },
      { id: 'management-inventory-count', label: 'Inventário Físico', to: '/management/inventory-count', icon: ClipboardList, permission: 'inventory.manage' },
      { id: 'management-losses', label: 'Perdas e Desperdícios', to: '/management/losses', icon: SlidersHorizontal, permission: 'inventory.manage' },
      { id: 'management-finance', label: 'Financeiro / Fluxo', to: '/management/finance', icon: Wallet, permission: 'finance.read' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM e Marketing',
    items: [
      { id: 'customers', label: 'Clientes (CRM)', to: '/customers', icon: Users, permission: 'crm.read' },
      { id: 'promotions', label: 'Promoções & Cupons', to: '/promotions', icon: Ticket, permission: 'crm.manage_coupons' },
    ],
  },
  {
    id: 'analytics',
    label: 'Gestão & Performance',
    items: [
      { id: 'analytics-reports', label: 'Relatórios Gerenciais', to: '/analytics/reports', icon: ChartLine, permission: 'reports.read' },
      { id: 'analytics-goals', label: 'Metas e Desempenho', to: '/analytics/goals', icon: Goal, permission: 'goals.read' },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    items: [{ id: 'settings', label: 'Configurações', to: '/settings', icon: Settings, permission: 'settings.manage' }],
  },
];

type SidebarState = {
  collapsed: boolean;
  openGroups: Record<string, boolean>;
};

function safeParseSidebarState(raw: string | null): SidebarState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    const collapsed = rec.collapsed;
    const openGroups = rec.openGroups;
    if (typeof collapsed !== 'boolean') return null;
    if (typeof openGroups !== 'object' || openGroups === null) return null;

    const og = openGroups as Record<string, unknown>;
    const normalized: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(og)) {
      if (typeof v === 'boolean') normalized[k] = v;
    }
    return { collapsed, openGroups: normalized };
  } catch {
    return null;
  }
}

function isItemActive(item: SidebarItem, pathname: string): boolean {
  if (item.match) return item.match(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function firstActiveGroupId(groups: readonly SidebarGroup[], pathname: string): string | null {
  for (const g of groups) {
    for (const it of g.items) {
      if (isItemActive(it, pathname)) return g.id;
    }
  }
  return null;
}

const SidebarGroupView = memo(function SidebarGroupView(props: {
  group: SidebarGroup;
  collapsed: boolean;
  isOpen: boolean;
  isAnyItemActive: boolean;
  onToggle: (groupId: string) => void;
}) {
  const { group, collapsed, isOpen, isAnyItemActive, onToggle } = props;

  return (
    <div className="select-none">
      <button
        type="button"
        onClick={() => onToggle(group.id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
          isAnyItemActive
            ? 'bg-primary-50 text-primary-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
        title={collapsed ? group.label : undefined}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-black text-gray-400 uppercase tracking-wider">
            {!collapsed ? group.label : group.label.slice(0, 1)}
          </span>
        </span>
        {!collapsed ? (
          <span
            className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : 'rotate-0'}`}
            aria-hidden
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
      </button>

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-200 ${
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="mt-1 space-y-1">
          {group.items.map((item) => {
            if (item.isExternal) {
              return (
                <a
                  key={item.id}
                  href={item.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-700 hover:bg-primary-50 hover:text-primary-700"
                >
                  <span className="w-6 flex items-center justify-center" aria-hidden>
                    <item.icon className="h-4 w-4" aria-hidden />
                  </span>
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    <LayoutGrid className="w-3 h-3 text-gray-400 rotate-45" />
                  </span>
                </a>
              );
            }
            return (
              <NavLink
                key={item.id}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) => {
                  const active = isActive;
                  return `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary-100 text-primary-800'
                      : 'text-gray-700 hover:bg-primary-50 hover:text-primary-700'
                  }`;
                }}
              >
                <span className="w-6 flex items-center justify-center" aria-hidden>
                  <item.icon className="h-4 w-4" aria-hidden />
                </span>
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
                {collapsed ? (
                  <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
                    {item.label}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
});

/**
 * Main app layout with sidebar navigation for authenticated pages.
 */
export function AppLayout() {
  const { user, clearUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [desktopSearch, setDesktopSearch] = useState('');
  const [copiedPublicLink, setCopiedPublicLink] = useState(false);
  const [storefrontBaseUrl, setStorefrontBaseUrl] = useState('');

  const initialSidebarState = useMemo(() => {
    const saved = safeParseSidebarState(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    if (saved) return saved;
    const openGroups: Record<string, boolean> = {};
    for (const g of SIDEBAR_GROUPS) openGroups[g.id] = g.id === 'dashboard';
    return { collapsed: false, openGroups } satisfies SidebarState;
  }, []);

  const [collapsed, setCollapsed] = useState<boolean>(initialSidebarState.collapsed);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialSidebarState.openGroups);

  useEffect(() => {
    const next: SidebarState = { collapsed, openGroups };
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(next));
  }, [collapsed, openGroups]);

  const userPermissions = user?.permissions ?? [];
  const tenantSlug = user?.tenant?.slug;
  const publicMenuUrl = tenantSlug && storefrontBaseUrl ? `${storefrontBaseUrl}/${tenantSlug}` : '';

  useEffect(() => {
    const envBase = (import.meta.env.VITE_STOREFRONT_BASE_URL as string | undefined)?.trim();
    if (envBase) {
      setStorefrontBaseUrl(envBase.replace(/\/+$/, ''));
      return;
    }

    const { protocol, hostname, origin, port } = window.location;

    // Production fallback: same origin. Dev fallback: probe common storefront ports.
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      setStorefrontBaseUrl(origin);
      return;
    }

    const candidatePorts = ['3000', '3001', '3002'].filter((p) => p !== port);
    const candidateBases = candidatePorts.map((p) => `${protocol}//${hostname}:${p}`);
    let cancelled = false;

    const probe = async () => {
      for (const base of candidateBases) {
        try {
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 1600);
          await fetch(`${base}/pizzaria-demo`, {
            method: 'GET',
            mode: 'cors',
            signal: controller.signal,
          });
          window.clearTimeout(timeout);
          if (!cancelled) setStorefrontBaseUrl(base);
          return;
        } catch {
          // Keep probing next candidate
        }
      }
      if (!cancelled) setStorefrontBaseUrl(`${protocol}//${hostname}:3000`);
    };

    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const filtered: SidebarGroup[] = [];
    for (const g of SIDEBAR_GROUPS) {
      const items = g.items
        .filter((it) => (it.permission ? hasPermission(userPermissions, it.permission) : true))
        .map((it) => it);

      if (items.length) filtered.push({ ...g, items: items as any });
    }
    return filtered;
  }, [userPermissions]);

  const activeGroupId = useMemo(() => {
    return firstActiveGroupId(groups, location.pathname);
  }, [groups, location.pathname]);

  const setAccordionOpenGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => {
      const alreadyOpen = prev[groupId] === true;
      const next: Record<string, boolean> = {};
      for (const g of SIDEBAR_GROUPS) next[g.id] = false;
      next[groupId] = !alreadyOpen;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((prev) => {
      if (prev[activeGroupId]) return prev;
      const next: Record<string, boolean> = {};
      for (const g of SIDEBAR_GROUPS) next[g.id] = false;
      next[activeGroupId] = true;
      return next;
    });
  }, [activeGroupId]);

  const toggleGroup = useCallback((groupId: string) => {
    setAccordionOpenGroup(groupId);
  }, [setAccordionOpenGroup]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => !v);
  }, []);

  const openMobile = useCallback(() => setIsMobileOpen(true), []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileOpen]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    clearUser();
    navigate('/login');
  };

  const handleCopyPublicUrl = useCallback(async () => {
    if (!publicMenuUrl) return;
    await navigator.clipboard.writeText(publicMenuUrl);
    setCopiedPublicLink(true);
    window.setTimeout(() => setCopiedPublicLink(false), 1500);
  }, [publicMenuUrl]);

  return (
    <div className="min-h-screen flex bg-gray-50">
      {isMobileOpen ? (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={closeMobile} />
      ) : null}

      <aside
        className={`fixed z-50 inset-y-0 left-0 bg-white border-r border-gray-200 flex flex-col transition-[transform,width] duration-200 ease-out md:static md:translate-x-0 ${
          collapsed ? 'w-[72px]' : 'w-64'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        aria-label="Sidebar"
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2">
          {!collapsed ? (
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-primary-700 truncate">Gestor Delivery</h1>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{user?.name || 'Carregando...'}</p>
            </div>
          ) : (
            <div className="w-full text-center">
              <span className="text-lg font-bold text-primary-700" aria-hidden>
                GD
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden md:inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
            title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>

        {tenantSlug ? (
          <div className="px-3 py-3 border-b border-gray-200 bg-gray-50">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">
              Cardápio Público
            </div>
            <div className="text-xs text-gray-700 font-medium truncate">/{tenantSlug}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a
                href={publicMenuUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver
              </a>
              <button
                type="button"
                onClick={handleCopyPublicUrl}
                className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedPublicLink ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        ) : null}

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
          {groups.map((group) => {
            const isOpen = openGroups[group.id] ?? false;
            const isAnyItemActive = group.items.some((it) => isItemActive(it, location.pathname));
            return (
              <SidebarGroupView
                key={group.id}
                group={group}
                collapsed={collapsed}
                isOpen={collapsed ? true : isOpen}
                isAnyItemActive={isAnyItemActive}
                onToggle={toggleGroup}
              />
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors ${
              collapsed ? 'flex items-center justify-center' : ''
            }`}
            title={collapsed ? 'Sair' : undefined}
          >
            <span aria-hidden>{collapsed ? '🚪' : '🚪 Sair'}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="hidden md:flex sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="h-14 px-4 flex items-center gap-3 w-full">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              aria-label="Alternar sidebar"
              title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>

            <div className="relative flex-1 max-w-[320px] lg:max-w-[520px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden />
              <input
                value={desktopSearch}
                onChange={(e) => setDesktopSearch(e.target.value)}
                placeholder="Buscar (atalhos, páginas, ações)"
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                title="Atalhos"
              >
                <CornerDownRight className="h-4 w-4" aria-hidden />
                <span className="hidden xl:inline">Atalhos</span>
              </button>
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-2 sm:px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              title="Notificações"
              aria-label="Notificações"
            >
              <Bell className="h-4 w-4" aria-hidden />
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 sm:px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              title="Perfil"
            >
              <UserCircle className="h-4 w-4" aria-hidden />
              <span className="hidden lg:inline truncate max-w-[120px] xl:max-w-[180px]">{user?.name || 'Conta'}</span>
            </button>
          </div>
        </header>

        <header className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="h-14 px-4 flex items-center justify-between">
            <button
              type="button"
              onClick={openMobile}
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0 text-center">
              <div className="text-sm font-semibold text-gray-900 truncate">Gestor Delivery</div>
              <div className="text-xs text-gray-500 truncate">{user?.name || 'Carregando...'}</div>
            </div>
            <div className="w-10" />
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
