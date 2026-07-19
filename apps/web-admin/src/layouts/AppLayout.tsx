import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasPermission } from '@gestor/auth';
import {
  Bell,
  ChevronRight,
  CreditCard,
  LayoutGrid,
  Layers3,
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
  Activity,
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
  return true;
};

const SIDEBAR_STORAGE_KEY = 'admin_sidebar_state_v1';

const SIDEBAR_GROUPS: readonly SidebarGroup[] = [
  {
    id: 'core',
    label: 'Visao Geral',
    items: [
      { id: 'dashboard', label: 'Dashboard Analitico', to: '/dashboard', icon: LayoutGrid },
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
    label: 'Operacao',
    items: [
      { id: 'health', label: 'Saude dos Tenants', to: '/health', icon: Activity, permission: 'saas.tenants.read' },
      { id: 'features', label: 'Feature Control', to: '/features', icon: Layers3, permission: 'saas.modules.read' },
      { id: 'integrations', label: 'Marketplace & IA', to: '/integrations', icon: Puzzle, permission: 'saas.settings.read', featureFlag: 'VITE_FEATURE_ADMIN_INTEGRATIONS' },
      { id: 'media', label: 'Biblioteca Global', to: '/media', icon: Images, permission: 'saas.settings.read' },
      { id: 'base-menus', label: 'Cardapios Base', to: '/base-menus', icon: BookOpenCheck, permission: 'saas.base_menu.read' },
      { id: 'base-media', label: 'Galeria Base', to: '/base-media', icon: LibraryBig, permission: 'saas.base_media.read' },
      { id: 'ai-global', label: 'Agente IA Global', to: '/ai-agent/global', icon: Bot, permission: 'saas.ai.read', featureFlag: 'VITE_FEATURE_AI_AGENT' },
    ],
  },
  {
    id: 'security',
    label: 'Seguranca',
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
  const hasActive = useMemo(() => group.items.some((it) => isItemActive(it.to, pathname)), [group.items, pathname]);

  return (
    <div className="select-none">
      {!collapsed ? (
        <button
          type="button"
          onClick={() => onToggle(group.id)}
          className={`group flex w-full items-center justify-between rounded-xl px-3 py-3 transition-all ${hasActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <span className="text-[10px] font-black uppercase tracking-widest">{group.label}</span>
          <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : 'rotate-0'}`} />
        </button>
      ) : null}

      <div className={`overflow-hidden transition-[max-height,opacity] duration-200 ${isOpen || collapsed ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="mt-1 space-y-1">
          {group.items.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-300 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                } ${collapsed ? 'justify-center' : ''}`
              }
            >
              <span className={`transition-colors ${collapsed ? '' : 'flex w-6 items-center justify-center'}`} aria-hidden>
                <item.icon className="h-[18px] w-[18px] stroke-[2.5px]" aria-hidden />
              </span>
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
              {collapsed ? (
                <span className="pointer-events-none absolute left-full z-50 ml-4 whitespace-nowrap rounded-xl bg-popover px-3.5 py-2 text-xs font-black text-popover-foreground opacity-0 shadow-2xl transition-all group-hover:opacity-100">
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
    for (const group of SIDEBAR_GROUPS) openGroups[group.id] = group.id === 'core';
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
    for (const group of SIDEBAR_GROUPS) {
      const items = group.items
        .filter((item) => isFeatureVisible(item.featureFlag))
        .filter((item) => (item.permission ? hasPermission(userPermissions, item.permission) : true));
      if (items.length) filtered.push({ ...group, items });
    }
    return filtered;
  }, [userPermissions]);

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const toggleCollapsed = useCallback(() => setCollapsed((value) => !value), []);
  const openMobile = useCallback(() => setIsMobileOpen(true), []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  const currentPageTitle = useMemo(() => {
    const details: Array<{ pattern: RegExp; title: string }> = [
      { pattern: /^\/tenants\/[^/]+\/modules$/, title: 'Módulos da Loja' },
      { pattern: /^\/tenants\/[^/]+\/access$/, title: 'Acessos da Loja' },
      { pattern: /^\/tenants\/[^/]+\/ai-agent$/, title: 'Agente IA da Loja' },
      { pattern: /^\/tenants\/[^/]+\/scheduling$/, title: 'Agendamentos da Loja' },
      { pattern: /^\/tenants\/[^/]+$/, title: 'Detalhes da Loja' },
      { pattern: /^\/base-menus\/[^/]+/, title: 'Cardápio Base' },
    ];
    const detail = details.find(({ pattern }) => pattern.test(location.pathname));
    if (detail) return detail.title;
    for (const group of SIDEBAR_GROUPS) {
      const item = group.items.find((candidate) => isItemActive(candidate.to, location.pathname));
      if (item) return item.label;
    }
    return 'Página não encontrada';
  }, [location.pathname]);

  useEffect(() => {
    document.title = `${appName} - ${currentPageTitle}`;
  }, [appName, currentPageTitle]);

  const handleLogout = async () => {
    await api.post('/auth/admin/logout').catch(() => undefined);
    localStorage.removeItem('admin_accessToken');
    localStorage.removeItem('admin_refreshToken');
    clearUser();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-background transition-colors duration-300">
      {isMobileOpen ? (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden" onClick={closeMobile} />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-[width,transform] duration-300 ease-out md:static md:translate-x-0 ${
          collapsed ? 'w-[72px]' : 'w-64'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        <div className={`border-b border-input100 p-6 dark:border-input800/60 ${collapsed ? 'flex justify-center' : ''}`}>
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-xl font-black text-primary-foreground shadow-lg shadow-primary/20">
                {appInitial}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-black tracking-tight text-foreground">{appName}</h1>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{user?.name || 'Carregando...'}</p>
              </div>
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-xl font-black text-primary-foreground shadow-lg shadow-primary/20">
              {appInitial}
            </div>
          )}
        </div>

        <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-3">
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

        <div className="border-t border-input100 p-4 dark:border-input800/60">
          <button
            onClick={handleLogout}
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-widest text-destructive transition-all hover:bg-destructive/10 ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={18} />
            {!collapsed ? <span>Encerrar Sessao</span> : null}
          </button>
        </div>
      </aside>

      <div className="relative z-0 flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 hidden h-16 items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur-xl md:flex">
          <button onClick={toggleCollapsed} className="rounded-xl p-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground">
            <Menu size={20} />
          </button>

          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={desktopSearch}
              onChange={(event) => setDesktopSearch(event.target.value)}
              placeholder="Pesquisar no sistema..."
              className="h-10 w-full rounded-xl border border-input bg-card pl-10 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-muted-foreground transition-all hover:bg-muted"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-card text-muted-foreground transition-all hover:bg-muted">
              <Bell size={18} />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-background bg-primary" />
            </button>

            <div className="mx-1 h-8 w-px bg-border" />

            <button className="flex items-center gap-3 rounded-2xl border border-border bg-card py-1 pl-1 pr-3 shadow-sm transition-all hover:shadow-md">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-primary">
                <UserCircle size={20} />
              </div>
              <span className="hidden text-xs font-bold text-foreground lg:block">{user?.name}</span>
            </button>
          </div>
        </header>

        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background px-4 backdrop-blur-xl transition-colors md:hidden">
          <button onClick={openMobile} className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-foreground">
            <Menu size={20} />
          </button>
          <div className="text-center">
            <div className="text-sm font-black uppercase tracking-tight text-foreground">{appName}</div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest leading-none text-muted-foreground">Gestao Global</div>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-card text-muted-foreground"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-background/50">
          <div key={location.pathname} className="animate-in fade-in p-4 duration-500 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
