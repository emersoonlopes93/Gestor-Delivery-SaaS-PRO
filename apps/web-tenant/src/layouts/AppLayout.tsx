import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasPermission } from '@gestor/auth';
import { Building2, ChefHat, ChevronRight, ClipboardList, Globe, LayoutGrid, LogOut, Menu, Moon, MoreHorizontal, QrCode, Sun, Truck, UserCircle } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import { useThemeStore } from '../stores/theme.store';
import { api } from '../lib/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BusinessGroupContext, Tenant, TenantLoginResponse, TenantSettings, TenantOperatingHours } from '@gestor/types';
import { useNotificationAudio } from '../hooks/useNotificationAudio';
import { useBrowserNotifications } from '../hooks/useBrowserNotifications';
import { useTenantCapabilities } from '../hooks/useTenantCapabilities';
import { usePlatformBranding } from '../hooks/usePlatformBranding';
import { useLogisticsSocket } from '../features/delivery/hooks/useLogisticsSocket';
import { useChatSocket } from '../features/whatsapp/hooks/useChatSocket';
import { StoreStatusControl } from '../components/store/StoreStatusControl';
import { resolveStoreOperationalStatus } from '../components/store/store-operational-status';
import toast, { Toaster } from 'react-hot-toast';
import { addNativeNotificationClickListener } from '../lib/native-notifications';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { OrderAlertTopbarButton } from '../features/orders/v2/OrderAlertTopbarButton';
import { createNotificationEvent, emitNotificationEvent } from '../notifications/notificationEvents';
import { filterSidebarNavigation, getBreadcrumbMetadata, getSidebarNavigation } from '../navigation/navigationRegistry';
import type { SidebarNavigationGroup, SidebarNavigationItem } from '../navigation/navigation.types';

const SIDEBAR_STORAGE_KEY = 'tenant_sidebar_state_v1';
const SIDEBAR_GROUPS = getSidebarNavigation();

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

function isItemActive(item: SidebarNavigationItem, pathname: string): boolean {
  if (item.match) return item.match(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function firstActiveGroupId(groups: readonly SidebarNavigationGroup[], pathname: string): string | null {
  for (const g of groups) {
    for (const it of g.items) {
      if (isItemActive(it, pathname)) return g.id;
    }
  }
  return null;
}

function MobileBottomNavigation({ pathname, navigate, onOpenMore, canUseOperations, canReadOrders, canUseKds, canReadDelivery }: {
  pathname: string;
  navigate: (to: string) => void;
  onOpenMore: () => void;
  canUseOperations: boolean;
  canReadOrders: boolean;
  canUseKds: boolean;
  canReadDelivery: boolean;
}) {
  const items = [
    canUseOperations ? { label: 'Operações', to: '/orders/manager', icon: LayoutGrid, active: pathname === '/orders/manager' } : null,
    canReadOrders ? { label: 'Pedidos', to: '/orders', icon: ClipboardList, active: pathname === '/orders' || pathname === '/orders/board' } : null,
    canUseKds ? { label: 'Cozinha', to: '/orders/kds', icon: ChefHat, active: pathname === '/orders/kds' } : null,
    canReadDelivery ? { label: 'Entregas', to: '/delivery/dispatch', icon: Truck, active: pathname.startsWith('/delivery/') } : null,
  ].filter((item): item is { label: string; to: string; icon: typeof LayoutGrid; active: boolean } => item !== null);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 pb-[max(0.5rem,var(--safe-area-bottom))] pt-2 shadow-[0_-12px_30px_rgb(0_0_0_/_0.08)] backdrop-blur-xl md:hidden" aria-label="Navegação principal mobile">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {items.slice(0, 4).map((item) => {
          const Icon = item.icon;
          return <button key={item.to} type="button" onClick={() => navigate(item.to)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${item.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} aria-current={item.active ? 'page' : undefined}><Icon className="h-5 w-5" /><span className="truncate">{item.label}</span></button>;
        })}
        <button type="button" onClick={onOpenMore} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-black text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Abrir mais opções"><MoreHorizontal className="h-5 w-5" /><span>Mais</span></button>
      </div>
    </nav>
  );
}

function SidebarGroupView(props: {
  group: SidebarNavigationGroup;
  collapsed: boolean;
  isOpen: boolean;
  isAnyItemActive: boolean;
  onToggle: (groupId: string) => void;
}) {
  const { group, collapsed, isOpen, isAnyItemActive, onToggle } = props;

  return (
    <div className="select-none">
      {!collapsed ? (
        <button
          type="button"
          onClick={() => onToggle(group.id)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-300 group ${isAnyItemActive
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 transition-colors">
            {group.label}
          </span>
          <span
            className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : 'rotate-0'}`}
            aria-hidden
          >
            <ChevronRight className="h-3.5 w-3.5 opacity-40" aria-hidden />
          </span>
        </button>
      ) : (
        <div className="mx-auto w-5 h-px bg-border/50 my-3" />
      )}

      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-200 ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
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
                  className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  <span className="w-6 flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden>
                    <item.icon className="h-4 w-4" aria-hidden />
                  </span>
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    <LayoutGrid className="w-3 h-3 text-muted-foreground rotate-45" />
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
                  return `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${isActive
                    ? 'bg-muted/80 text-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-hover dark:hover:bg-sidebar-hover hover:text-foreground'
                    } ${collapsed ? 'justify-center' : ''}`;
                }}
              >
                {({ isActive }) => (
                  <>
                    {isActive && !collapsed && (
                      <span className="absolute -left-3 top-[18%] bottom-[18%] w-[3px] bg-primary rounded-r-full" aria-hidden />
                    )}
                    <span
                      className={`flex items-center justify-center transition-colors duration-300 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}
                      aria-hidden
                    >
                      <item.icon className="h-[18px] w-[18px] stroke-[2.5px]" aria-hidden />
                    </span>
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {collapsed ? (
                      <span className="pointer-events-none absolute left-full ml-4 whitespace-nowrap rounded-xl bg-card border border-border px-3.5 py-2 text-xs font-black text-foreground opacity-0 shadow-2xl transition-all duration-300 translate-x-[-8px] group-hover:translate-x-0 group-hover:opacity-100 z-50 dark:bg-popover dark:text-popover-foreground">
                        {item.label}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Main app layout with sidebar navigation for authenticated pages.
 */
export function AppLayout() {
  const { user, clearUser, setUser } = useAuthStore();
  const { resolvedTheme, setTheme, initializeTheme } = useThemeStore();
  const { isFeatureVisible } = useTenantCapabilities();
  const platformBrandingQuery = usePlatformBranding();
  const navigate = useNavigate();
  const location = useLocation();

  // Inicializar tema apenas para rotas autenticadas
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [storefrontBaseUrl, setStorefrontBaseUrl] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [platformLogoFailed, setPlatformLogoFailed] = useState(false);

  const systemName = platformBrandingQuery.data?.systemName || 'PedeHub';
  const platformLogoUrl = platformBrandingQuery.data?.logoUrl || null;

  useEffect(() => {
    setPlatformLogoFailed(false);
  }, [platformLogoUrl]);

  const { data: tenantData } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: async () => {
      const res = await api.get<Tenant & { settings: TenantSettings; operatingHours: TenantOperatingHours[]; businessGroup?: BusinessGroupContext | null }>('/tenant/me');
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const queryClient = useQueryClient();
  const accessibleStores = user?.accessibleTenants ?? [];

  const switchStoreMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const res = await api.post<TenantLoginResponse>('/auth/tenant/switch-store', { tenantId });
      return res.data;
    },
    onSuccess: (data) => {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      setUser(data.user);
      setSelectedTenantId(data.user.tenantId);
      void queryClient.invalidateQueries();
      navigate('/dashboard');
    },
    onError: (err) => {
      console.error('Erro ao trocar loja:', err);
      alert('NÃ£o foi possÃ­vel trocar de loja nesta rede.');
    },
  });

  const resolvedStoreStatus = useMemo(() => resolveStoreOperationalStatus(
    tenantData?.settings,
    tenantData?.operatingHours ?? [],
  ), [tenantData]);
  const storeStatus = resolvedStoreStatus.status;

  const storePauseMutation = useMutation({
    mutationFn: async (nextPaused: boolean) => {
      if (!resolvedStoreStatus.canTogglePause) {
        throw new Error('A pausa operacional sÃ³ pode ser alterada dentro do horÃ¡rio de funcionamento.');
      }
      return api.patch('/tenant/store-pause', {
        isStorePaused: nextPaused,
        storePauseReason: nextPaused ? 'Pausa operacional pelo sidebar' : '',
      });
    },
    onSuccess: (_response, nextPaused) => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      toast.success(nextPaused ? 'Recebimento de pedidos pausado.' : 'Recebimento de pedidos retomado.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'NÃ£o foi possÃ­vel alterar a pausa operacional.');
    },
  });

  const previousStoreStatusRef = useRef<{ tenantId: string; status: 'open' | 'closed' | 'paused' } | null>(null);

  const handleSwitchStore = () => {
    if (!selectedTenantId || selectedTenantId === user?.tenantId) {
      return;
    }
    switchStoreMutation.mutate(selectedTenantId);
  };

  useNotificationAudio(tenantData?.id);

  // MantÃ©m conexÃ£o ao namespace /chat ativa em qualquer rota autenticada.
  // NecessÃ¡rio para que whatsapp.handoff chegue ao bus de notificaÃ§Ã£o
  // independentemente de o operador estar ou nÃ£o na InboxPage.
  useChatSocket(tenantData?.id);

  // Browser Notifications Integration
  useBrowserNotifications(
    tenantData?.settings?.browserNotificationsEnabled ?? true,
    tenantData?.id,
  );

  useLogisticsSocket(tenantData?.id);

  const initialSidebarState = useMemo(() => {
    const saved = safeParseSidebarState(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    if (saved) return saved;
    const openGroups: Record<string, boolean> = {};
    for (const g of SIDEBAR_GROUPS) openGroups[g.id] = g.id === 'operations';
    return { collapsed: false, openGroups } satisfies SidebarState;
  }, []);

  const [collapsed, setCollapsed] = useState<boolean>(initialSidebarState.collapsed);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialSidebarState.openGroups);

  useEffect(() => {
    const next: SidebarState = { collapsed, openGroups };
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(next));
  }, [collapsed, openGroups]);

  const userPermissions = useMemo(() => user?.permissions ?? [], [user?.permissions]);
  const canUseOperations = Boolean(isFeatureVisible?.(undefined, 'order_manager_v2')) && hasPermission(userPermissions, 'orders.use_kanban');
  const canReadOrders = hasPermission(userPermissions, 'orders.read');
  const canUseKds = Boolean(isFeatureVisible?.(undefined, 'kds')) && hasPermission(userPermissions, 'kds.use');
  const canReadDelivery = hasPermission(userPermissions, 'delivery.read');
  const tenantSlug = user?.tenant?.slug;
  const publicMenuUrl = tenantSlug && storefrontBaseUrl ? `${storefrontBaseUrl}/${tenantSlug}` : '';

  useEffect(() => {
    const envBase = (import.meta.env.VITE_STOREFRONT_BASE_URL as string | undefined)?.trim();
    if (envBase) {
      setStorefrontBaseUrl(envBase.replace(/\/+$/, ''));
      return;
    }

    const { hostname, origin } = window.location;

    // Capacitor/Android: hostname Ã© 'capacitor://localhost', nÃ£o fazer parsing
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('capacitor://')) {
      // Em Capacitor ou localhost, usar variÃ¡vel de ambiente ou fallback seguro
      // Se nÃ£o tiver VITE_STOREFRONT_BASE_URL configurado, usar a mesma origem da API
      const apiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
      if (apiBase && !apiBase.startsWith('/')) {
        // Extrair origin da API URL (removendo /api/v1 ou similar)
        const apiOrigin = apiBase.replace(/\/api\/v\d+.*$/, '');
        setStorefrontBaseUrl(apiOrigin);
        return;
      }
      // Fallback final: nÃ£o definir storefrontBaseUrl em Capacitor sem config
      setStorefrontBaseUrl('');
      return;
    }

    // Production fallback: same origin. Dev fallback: common storefront port.
    if (hostname.startsWith('app-')) {
      setStorefrontBaseUrl(origin.replace('app-', ''));
    } else if (hostname.startsWith('app.')) {
      setStorefrontBaseUrl(origin.replace('app.', ''));
    } else {
      setStorefrontBaseUrl(origin.replace('tenant', 'storefront'));
    }
  }, []);

  const groups = useMemo(() => {
    return filterSidebarNavigation(
      SIDEBAR_GROUPS,
      (featureFlag, featureKey) => isFeatureVisible ? isFeatureVisible(featureFlag, featureKey) : !featureFlag || String(import.meta.env[featureFlag]).toLowerCase() === 'true',
      (permission) => !permission || hasPermission(userPermissions, permission),
    );
  }, [isFeatureVisible, userPermissions]);

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
    setSelectedTenantId(user?.tenantId ?? '');
  }, [user?.tenantId]);

  useEffect(() => {
    if (!isMobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileOpen]);

  const handleLogout = async () => {
    await api.post('/auth/tenant/logout').catch(() => undefined);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    clearUser();
    navigate('/login');
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    addNativeNotificationClickListener(() => {
      navigate('/orders');
    }).then((handle) => {
      cleanup = () => {
        void handle?.remove();
      };
    }).catch((err) => {
      console.warn('[NativeNotifications] Falha ao registrar listener:', err);
    });

    return () => {
      cleanup?.();
    };
  }, [navigate]);

  useEffect(() => {
    if (!tenantData?.id) return;

    const previous = previousStoreStatusRef.current;
    if (!previous || previous.tenantId !== tenantData.id) {
      previousStoreStatusRef.current = { tenantId: tenantData.id, status: storeStatus };
      return;
    }

    const previousStatus = previous.status;
    if (previousStatus !== storeStatus) {
      if (storeStatus === 'open') {
        emitNotificationEvent(createNotificationEvent({
          id: `store:${previousStatus === 'paused' ? 'resumed' : 'opened'}:${tenantData?.id ?? 'tenant'}`,
          type: previousStatus === 'paused' ? 'store.resumed' : 'store.opened',
          title: 'Loja aberta',
          message: 'A operacao voltou a receber pedidos.',
          priority: 'low',
          source: 'local',
        }));
      } else if (previousStatus === 'open') {
        const type = storeStatus === 'paused' ? 'store.paused' : 'store.closed';
        emitNotificationEvent(createNotificationEvent({
          id: `store:${storeStatus}:${tenantData?.id ?? 'tenant'}`,
          type,
          title: 'Loja indisponivel para novos pedidos',
          message: storeStatus === 'paused' ? 'A loja foi pausada manualmente.' : 'A loja esta fora do horario configurado.',
          priority: 'high',
          source: 'local',
        }));
      }
    }

    previousStoreStatusRef.current = { tenantId: tenantData.id, status: storeStatus };
  }, [storeStatus, tenantData?.id]);



  const breadcrumb = getBreadcrumbMetadata(location.pathname);

  useEffect(() => {
    document.title = breadcrumb.label ? `${systemName} - ${breadcrumb.label}` : systemName;
  }, [breadcrumb.label, systemName]);

  return (
    <div className="app-shell min-h-screen flex transition-colors safe-x" style={{ backgroundColor: 'var(--surface-page)' }}>
      <NotificationCenter />
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'font-bold text-sm',
          success: {
            style: { background: 'var(--status-open)', color: 'var(--status-success-foreground)', borderRadius: '12px' },
            iconTheme: { primary: 'var(--status-success-foreground)', secondary: 'var(--status-open)' },
          },
          error: {
            style: { background: 'var(--destructive)', color: 'var(--destructive-foreground)', borderRadius: '12px' },
            iconTheme: { primary: 'var(--destructive-foreground)', secondary: 'var(--destructive)' },
          },
        }}
      />
      {isMobileOpen ? (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={closeMobile} />
      ) : null}

      <aside
        className={`tenant-sidebar safe-top safe-bottom safe-drawer-left fixed z-50 inset-y-0 left-0 flex flex-col transition-[transform,width,background-color] duration-200 ease-out md:static md:translate-x-0 ${collapsed ? 'w-[72px]' : 'w-64'
          } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ backgroundColor: 'var(--surface-base)', borderRight: '1px solid var(--border-default)' }}
        aria-label="Sidebar"
      >
        <div className={`p-3 flex flex-col gap-3 ${collapsed ? 'items-center' : ''}`} style={{ borderBottom: '1px solid var(--border-default)' }}>
          {/* Brand + toggle button row */}
          <div className="flex items-center justify-between w-full gap-2">
            {collapsed ? (
              <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black text-lg shadow-md shrink-0 mx-auto">
                {(systemName?.charAt(0) || 'P').toUpperCase()}
              </div>
            ) : (
              <div className="min-w-0 flex flex-col items-start flex-1">
                {platformLogoUrl && !platformLogoFailed ? (
                  <div className="min-w-0 flex flex-col items-start gap-1">
                    <img
                      src={platformLogoUrl}
                      alt={systemName}
                      className="block max-w-[120px] max-h-[32px] object-contain"
                      onError={() => setPlatformLogoFailed(true)}
                    />
                    <p className="text-[9px] font-black text-muted-foreground truncate leading-none uppercase tracking-wider max-w-[130px]">
                      {user?.tenant?.name || 'Carregando...'}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-black text-base shadow-md shrink-0">
                      {(systemName?.charAt(0) || 'P').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex flex-col items-start text-left">
                      <h1 className="text-[12px] font-black text-foreground tracking-tight truncate leading-tight max-w-[110px]">
                        {systemName}
                      </h1>
                      <p className="text-[9px] font-black text-muted-foreground truncate leading-none uppercase tracking-wider max-w-[110px]">
                        {user?.tenant?.name || 'Carregando...'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden md:flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
              title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>

          {!collapsed && (
            <>
              {tenantData?.businessGroup ? (
                <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-foreground">
                  <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{tenantData.businessGroup.name}</span>
                  <span className="text-muted-foreground font-bold normal-case tracking-normal">
                    {tenantData.businessGroup._count?.tenants ?? tenantData.businessGroup.tenants?.length ?? 0} lojas
                  </span>
                </div>
              ) : null}
              {accessibleStores.length > 1 ? (
                <div className="flex items-center gap-2 w-full">
                  <select
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    disabled={switchStoreMutation.isPending}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-[11px] font-bold text-foreground outline-none"
                  >
                    {accessibleStores.map((store) => (
                      <option key={store.tenantId} value={store.tenantId}>
                        {store.tenant.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleSwitchStore}
                    disabled={switchStoreMutation.isPending || !selectedTenantId || selectedTenantId === user?.tenantId}
                    className="shrink-0 rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-black uppercase tracking-widest text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {switchStoreMutation.isPending ? 'Trocando' : 'Abrir'}
                  </button>
                </div>
              ) : null}

              <StoreStatusControl
                status={storeStatus}
                isPaused={Boolean(tenantData?.settings?.isStorePaused)}
                canTogglePause={resolvedStoreStatus.canTogglePause}
                nextOpenTime={resolvedStoreStatus.nextOpenTime}
                isSaving={storePauseMutation.isPending}
                onTogglePause={(nextPaused) => storePauseMutation.mutate(nextPaused)}
              />

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-1.5 w-full">
                <a
                  href={publicMenuUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-row items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all group shadow-sm h-[34px]"
                >
                  <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors truncate">CardÃ¡pio</span>
                </a>
                <button
                  type="button"
                  onClick={() => navigate('/settings/qr-codes')}
                  className="flex flex-row items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all group shadow-sm h-[34px]"
                >
                  <QrCode className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors truncate">QR Code</span>
                </button>
              </div>
            </>
          )}
        </div>

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

        <div className="p-4" style={{ borderTop: '1px solid var(--border-default)' }}>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-destructive hover:bg-destructive/10 transition-all active:scale-95 ${collapsed ? 'justify-center' : ''
              }`}
            title={collapsed ? 'Sair' : undefined}
          >
            <LogOut className="w-[18px] h-[18px] stroke-[2.5px]" />
            {!collapsed && <span>Sair do Sistema</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="desktop-header hidden md:flex sticky top-0 z-30 backdrop-blur-xl" style={{ height: '52px', backgroundColor: 'var(--surface-base)', borderBottom: '1px solid var(--border-default)' }}>
          <div className="px-6 flex items-center justify-between w-full h-full min-w-0 gap-4">
            <div className="flex items-center gap-3 min-w-0">

              <div className="flex items-center text-sm font-bold text-foreground min-w-0">
                {breadcrumb.parentLabel && (
                  <span className="hidden sm:inline text-muted-foreground shrink-0 select-none">
                    {breadcrumb.parentLabel}
                    <span className="mx-2 font-normal text-muted-foreground/65">/</span>
                  </span>
                )}
                <span className="truncate select-none font-black text-foreground">
                  {breadcrumb.label}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {location.pathname === '/orders/manager' ? <OrderAlertTopbarButton /> : null}
              <button
                type="button"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted text-foreground hover:bg-muted/80 transition-all border-none"
                title="Tema"
                aria-label="Alternar Tema"
              >
                {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
              </button>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card p-1 sm:pr-3 text-xs font-bold text-foreground hover:bg-muted transition-all shadow-sm select-none"
                title="Perfil"
              >
                <div className="w-6 h-6 rounded-full bg-primary-50 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
                  <UserCircle className="h-4 w-4" aria-hidden />
                </div>
                <span className="hidden min-[1150px]:inline truncate max-w-[120px]">{user?.name || 'Conta'}</span>
                <ChevronRight className="hidden min-[1150px]:inline h-3 w-3 text-muted-foreground rotate-90" aria-hidden />
              </button>
            </div>
          </div>
        </header>

        <header className="mobile-header safe-top md:hidden sticky top-0 z-30 backdrop-blur-xl transition-colors" style={{ height: 'calc(52px + var(--safe-area-top))', backgroundColor: 'var(--surface-base)', borderBottom: '1px solid var(--border-default)' }}>
          <div className="px-4 flex items-center justify-between w-full h-full gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={openMobile}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card w-8 h-8 text-foreground hover:bg-muted transition-all shrink-0"
                aria-label="Abrir menu"
              >
                <Menu className="h-4.5 w-4.5" aria-hidden />
              </button>
              <div className="truncate text-xs font-black text-foreground select-none">
                {breadcrumb.label}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {location.pathname === '/orders/manager' ? <OrderAlertTopbarButton /> : null}
              <button
                type="button"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-muted text-muted-foreground transition-all"
                aria-label="Alternar tema"
              >
                {resolvedTheme === 'dark' ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
              </button>
              <div className="w-7 h-7 rounded-full bg-primary-50 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
                <UserCircle className="h-4.5 w-4.5" aria-hidden />
              </div>
            </div>
          </div>
        </header>

        <main className="app-main min-w-0 flex-1 overflow-auto bg-background pb-[calc(4.75rem+var(--safe-area-bottom))] safe-bottom md:pb-0">
          <div key={location.pathname} className="h-full">
            <Outlet />
          </div>
        </main>
        <MobileBottomNavigation pathname={location.pathname} navigate={navigate} onOpenMore={openMobile} canUseOperations={canUseOperations} canReadOrders={canReadOrders} canUseKds={canUseKds} canReadDelivery={canReadDelivery} />
      </div>
    </div>
  );
}
