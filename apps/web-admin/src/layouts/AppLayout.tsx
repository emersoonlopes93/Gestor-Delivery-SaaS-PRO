import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasPermission } from '@gestor/auth';
import {
  Bell,
  ChevronRight,
  CornerDownRight,
  CreditCard,
  LayoutGrid,
  Menu,
  Search,
  Shield,
  Store,
  UserCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';

type SidebarItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: string;
};

type SidebarGroup = {
  id: string;
  label: string;
  items: readonly SidebarItem[];
};

const SIDEBAR_STORAGE_KEY = 'admin_sidebar_state_v1';

const SIDEBAR_GROUPS: readonly SidebarGroup[] = [
  {
    id: 'core',
    label: 'Admin',
    items: [
      { id: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: LayoutGrid },
      { id: 'tenants', label: 'Tenants', to: '/tenants', icon: Store, permission: 'saas.tenants.read' },
    ],
  },
  {
    id: 'platform',
    label: 'Plataforma',
    items: [
      { id: 'franchise', label: 'Dashboard Franquias', to: '/franchise', icon: Store, permission: 'saas.franchise.read' },
      { id: 'billing', label: 'Planos & Billing', to: '/billing', icon: CreditCard, permission: 'saas.plans.read' },
      { id: 'audit-logs', label: 'Logs de Auditoria', to: '/audit-logs', icon: Shield, permission: 'saas.audit.read' },
    ],
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

function isItemActive(to: string, pathname: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function firstActiveGroupId(groups: readonly SidebarGroup[], pathname: string): string | null {
  for (const g of groups) {
    for (const it of g.items) {
      if (isItemActive(it.to, pathname)) return g.id;
    }
  }
  return null;
}

const SidebarGroupView = memo(function SidebarGroupView(props: {
  group: SidebarGroup;
  collapsed: boolean;
  isOpen: boolean;
  onToggle: (groupId: string) => void;
}) {
  const { group, collapsed, isOpen, onToggle } = props;

  return (
    <div className="select-none">
      <button
        type="button"
        onClick={() => onToggle(group.id)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        title={collapsed ? group.label : undefined}
      >
        <span className="text-xs font-black text-gray-400 uppercase tracking-wider">
          {!collapsed ? group.label : group.label.slice(0, 1)}
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
          {group.items.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-800'
                    : 'text-gray-700 hover:bg-primary-50 hover:text-primary-700'
                }`
              }
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
          ))}
        </div>
      </div>
    </div>
  );
});

export function AppLayout() {
  const { user, clearUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [desktopSearch, setDesktopSearch] = useState('');

  const initialSidebarState = useMemo(() => {
    const saved = safeParseSidebarState(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    if (saved) return saved;
    const openGroups: Record<string, boolean> = {};
    for (const g of SIDEBAR_GROUPS) openGroups[g.id] = g.id === 'core';
    return { collapsed: false, openGroups } satisfies SidebarState;
  }, []);

  const [collapsed, setCollapsed] = useState<boolean>(initialSidebarState.collapsed);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialSidebarState.openGroups);

  useEffect(() => {
    const next: SidebarState = { collapsed, openGroups };
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(next));
  }, [collapsed, openGroups]);

  const userPermissions = user?.permissions ?? [];
  const groups = useMemo(() => {
    const filtered: SidebarGroup[] = [];
    for (const g of SIDEBAR_GROUPS) {
      const items = g.items.filter((it) => (it.permission ? hasPermission(userPermissions, it.permission) : true));
      if (items.length) filtered.push({ ...g, items });
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
    localStorage.removeItem('admin_accessToken');
    localStorage.removeItem('admin_refreshToken');
    clearUser();
    navigate('/login');
  };

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
              <h1 className="text-lg font-bold text-primary-700 truncate">SaaS Admin</h1>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{user?.name || 'Carregando...'}</p>
            </div>
          ) : (
            <div className="w-full text-center">
              <span className="text-lg font-bold text-primary-700" aria-hidden>
                SA
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

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
          {groups.map((group) => {
            const isOpen = openGroups[group.id] ?? false;
            return (
              <SidebarGroupView
                key={group.id}
                group={group}
                collapsed={collapsed}
                isOpen={collapsed ? true : isOpen}
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

            <div className="relative flex-1 max-w-[520px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden />
              <input
                value={desktopSearch}
                onChange={(e) => setDesktopSearch(e.target.value)}
                placeholder="Buscar (tenants, módulos, ações)"
                className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              title="Atalhos"
            >
              <CornerDownRight className="h-4 w-4" aria-hidden />
              <span className="hidden lg:inline">Atalhos</span>
            </button>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              title="Notificações"
              aria-label="Notificações"
            >
              <Bell className="h-4 w-4" aria-hidden />
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              title="Perfil"
            >
              <UserCircle className="h-4 w-4" aria-hidden />
              <span className="hidden lg:inline truncate max-w-[180px]">{user?.name || 'Conta'}</span>
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
              <div className="text-sm font-semibold text-gray-900 truncate">SaaS Admin</div>
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
