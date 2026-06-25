import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasPermission } from '@gestor/auth';
import {
  Bell,
  ChevronRight,
  CreditCard,
  LayoutGrid,
  Menu,
  Search,
  Shield,
  Store,
  UserCircle,
  Puzzle,
  Moon,
  Sun,
  LogOut,
  Globe,
  Bot,
  Images,
  LibraryBig,
  BookOpenCheck,
  Activity
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import { useThemeStore } from '../stores/theme.store';
import { api } from '../lib/api-client';
import { usePlatformBrand } from '../hooks/use-platform-brand';

type SidebarItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: string;
  featureFlag?: string;
};

type SidebarGroup = {
  id: string;
  label: string;
  items: readonly SidebarItem[];
};

const isFeatureVisible = (flag?: string) => {
  if (!flag) return true;
  // TODO: implement actual feature flags from config/environment
  return true;
};

const SIDEBAR_STORAGE_KEY = 'admin_sidebar_state_v1';

function isFeatureEnabled(flag: string): boolean {
  if (!flag) return true;
  const envMeta = import.meta as { env?: Record<string, string | undefined> };
  const env = envMeta.env ?? {};
  return env[flag] === 'true';
}

const SIDEBAR_GROUPS: readonly SidebarGroup[] = [
  {
    id: 'core',
    label: 'Visão Geral',
    items: [
      { id: 'dashboard', label: 'Dashboard Analítico', to: '/dashboard', icon: LayoutGrid },
    ],
  },
  {
    id: 'clients',
    label: 'Clientes',
    items: [
      { id: 'tenants', label: 'Lojas (Tenants)', to: '/tenants', icon: Store, permission: 'saas.tenants.read' },
      { id: 'franchise', label: 'Franquias', to: '/franchise', icon: Globe, permission: 'saas.franchise.read', featureFlag: 'VITE_FEATURE_FRANCHISE' },
    ],
  },
  {
    id: 'financial',
    label: 'Financeiro',
    items: [
      { id: 'billing', label: 'Billing Console', to: '/billing', icon: CreditCard, permission: 'saas.billing.read' },
    ],
  },
  {
    id: 'operation',
    label: 'Operação',
    items: [
      { id: 'health', label: 'Saúde dos Tenants', to: '/health', icon: Activity, permission: 'saas.tenants.read' },
      { id: 'integrations', label: 'Marketplace & IA', to: '/integrations', icon: Puzzle, permission: 'saas.settings.read', featureFlag: 'VITE_FEATURE_ADMIN_INTEGRATIONS' },
      { id: 'media', label: 'Biblioteca Global', to: '/media', icon: Images, permission: 'saas.settings.read' },
      { id: 'base-menus', label: 'Cardápios Base', to: '/base-menus', icon: BookOpenCheck, permission: 'saas.base_menu.read' },
      { id: 'base-media', label: 'Galeria Base', to: '/base-media', icon: LibraryBig, permission: 'saas.base_media.read' },
      { id: 'ai-global', label: 'Agente IA Global', to: '/ai-agent/global', icon: Bot, permission: 'saas.ai.read', featureFlag: 'VITE_FEATURE_AI_AGENT' },
    ],
  },
  {
    id: 'security',
    label: 'Segurança',
    items: [
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

const SidebarGroupView = memo(function SidebarGroupView(props: {
  group: SidebarGroup;
  collapsed: boolean;
  isOpen: boolean;
  onToggle: (groupId: string) => void;
  pathname: string;
}) {
  const { group, collapsed, isOpen, onToggle, pathname } = props;
  const hasActive = useMemo(() => group.items.some(it => isItemActive(it.to, pathname)), [group.items, pathname]);

  return (
    <div className="select-none">
      {!collapsed && (
        <button
          type="button"
          onClick={() => onToggle(group.id)}
          className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all group ${hasActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <span className="text-[10px] font-black uppercase tracking-widest">
            {group.label}
          </span>
          <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : 'rotate-0'}`} />
        </button>
      )}

      <div className={`overflow-hidden transition-[max-height,opacity] duration-200 ${isOpen || collapsed ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="mt-1 space-y-1">
          {group.items.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                } ${collapsed ? 'justify-center' : ''}`
              }
            >
              <span className={`transition-colors ${collapsed ? '' : 'w-6 flex items-center justify-center'}`} aria-hidden>
                <item.icon className="h-[18px] w-[18px] stroke-[2.5px]" aria-hidden />
              </span>
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
              {collapsed ? (
                <span className="pointer-events-none absolute left-full ml-4 whitespace-nowrap rounded-xl bg-popover px-3.5 py-2 text-xs font-black text-popover-foreground opacity-0 shadow-2xl transition-all group-hover:opacity-100 z-50">
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
  const { theme, setTheme } = useThemeStore();
  const { appName, appInitial } = usePlatformBrand();
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

  const userPermissions = useMemo(() => user?.permissions ?? [], [user?.permissions]);
  const groups = useMemo(() => {
    const filtered: SidebarGroup[] = [];
    for (const g of SIDEBAR_GROUPS) {
      const items = g.items
        .filter((it) => isFeatureVisible(it.featureFlag))
        .filter((it) => (it.permission ? hasPermission(userPermissions, it.permission) : true));
      if (items.length) filtered.push({ ...g, items });
    }
    return filtered;
  }, [userPermissions]);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);
  const openMobile = useCallback(() => setIsMobileOpen(true), []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  const handleLogout = async () => {
    await api.post('/auth/admin/logout').catch(() => undefined);
    localStorage.removeItem('admin_accessToken');
    localStorage.removeItem('admin_refreshToken');
    clearUser();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-background transition-colors duration-300">
      {isMobileOpen ? (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden backdrop-blur-sm" onClick={closeMobile} />
      ) : null}

      <aside
        className={`fixed z-40 inset-y-0 left-0 bg-card border-r border-border flex flex-col transition-[width,transform] duration-300 ease-out md:static md:translate-x-0 ${
          collapsed ? 'w-[72px]' : 'w-64'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className={`p-6 border-b border-input100 dark:border-input800/60 ${collapsed ? 'flex justify-center' : ''}`}>
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black text-xl shadow-lg shadow-primary/20">
                {appInitial}
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-black text-foreground tracking-tight truncate">{appName}</h1>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{user?.name || 'Carregando...'}</p>
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black text-xl shadow-lg shadow-primary/20">
              {appInitial}
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {groups.map((group) => (
            <SidebarGroupView
              key={group.id}
              group={group}
              collapsed={collapsed}
              isOpen={openGroups[group.id] ?? true}
              onToggle={toggleGroup}
              pathname={location.pathname}
            />
          ))}
        </nav>

        <div className="p-4 border-t border-input100 dark:border-input800/60">
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-destructive hover:bg-destructive/10 transition-all ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={18} />
            {!collapsed && <span>Encerrar Sessão</span>}
          </button>
        </div>
      </aside>

      <div className="relative z-0 flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="hidden md:flex sticky top-0 z-10 h-16 bg-background/80 backdrop-blur-xl border-b border-border px-6 items-center gap-4">
          <button onClick={toggleCollapsed} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all">
            <Menu size={20} />
          </button>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={desktopSearch}
              onChange={(e) => setDesktopSearch(e.target.value)}
              placeholder="Pesquisar no sistema..."
              className="w-full h-10 pl-10 pr-4 bg-card border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-card text-muted-foreground hover:bg-muted transition-all"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-card text-muted-foreground hover:bg-muted transition-all relative">
              <Bell size={18} />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full border-2 border-background" />
            </button>

            <div className="h-8 w-px bg-border mx-1" />

            <button className="flex items-center gap-3 pl-1 pr-3 py-1 rounded-2xl bg-card border border-border shadow-sm hover:shadow-md transition-all">
              <div className="w-8 h-8 rounded-xl bg-muted text-primary flex items-center justify-center">
                <UserCircle size={20} />
              </div>
              <span className="text-xs font-bold text-foreground hidden lg:block">{user?.name}</span>
            </button>
          </div>
        </header>

        <header className="md:hidden sticky top-0 z-10 h-14 bg-background backdrop-blur-xl border-b border-border px-4 flex items-center justify-between transition-colors">
          <button onClick={openMobile} className="w-10 h-10 flex items-center justify-center rounded-xl bg-card text-foreground">
            <Menu size={20} />
          </button>
          <div className="text-center">
            <div className="text-sm font-black text-foreground uppercase tracking-tight">{appName}</div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none mt-0.5">Gestão Global</div>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-card text-muted-foreground"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-background/50">
          <div key={location.pathname} className="animate-in fade-in duration-500 p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

