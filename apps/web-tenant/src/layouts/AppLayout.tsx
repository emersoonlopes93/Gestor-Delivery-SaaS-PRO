import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Moon,
  Sun,
  LogOut,
  Globe,
  QrCode,
  Printer,
  MessageSquare,
  Megaphone,
  Bot,
  Palette,
  Link2,
  CreditCard,
  CalendarClock,
  Smartphone
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import { useThemeStore } from '../stores/theme.store';
import { api } from '../lib/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Tenant, TenantSettings, TenantOperatingHours } from '@gestor/types';
import { useNotificationAudio } from '../hooks/useNotificationAudio';
import { useBrowserNotifications } from '../hooks/useBrowserNotifications';
import { useLogisticsSocket } from '../features/delivery/hooks/useLogisticsSocket';
import { Toaster } from 'react-hot-toast';
import { addNativeNotificationClickListener } from '../lib/native-notifications';

type SidebarItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: string;
  featureFlag?: string;
  isExternal?: boolean;
  match?: (pathname: string) => boolean;
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
      {
        id: 'billing-plan',
        label: 'Plano e Cobrança',
        to: '/billing',
        icon: CreditCard,
        permission: 'billing.read',
        match: (p) => p === '/billing',
      },
    ],
  },
  {
    id: 'catalog',
    label: 'Cardápio',
    items: [
      { id: 'catalog-categories', label: 'Categorias', to: '/catalog/categories', icon: BookOpen, permission: 'catalog.read' },
      { id: 'catalog-products', label: 'Produtos', to: '/catalog/products', icon: Box, permission: 'catalog.read' },
      { id: 'catalog-complements', label: 'Grupos de Opções', to: '/catalog/option-groups', icon: SlidersHorizontal, permission: 'catalog.manage_option_groups' },
      { id: 'catalog-combos', label: 'Combos', to: '/catalog/combos', icon: Package, permission: 'catalog.manage_combos' },
      { id: 'catalog-upsells', label: 'Upsells', to: '/catalog/upsells', icon: SlidersHorizontal, permission: 'catalog.read', featureFlag: 'VITE_FEATURE_UPSELLS' },
      { id: 'catalog-inventory', label: 'Estoque & Ficha Técnica', to: '/inventory', icon: ClipboardList, permission: 'inventory.read', featureFlag: 'VITE_FEATURE_INVENTORY_ADVANCED' },
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
      { id: 'delivery-map', label: 'Mapa (Tempo Real)', to: '/delivery/map', icon: MapPin, permission: 'delivery.read', featureFlag: 'VITE_FEATURE_DELIVERY_LIVE_MAP' },
      { id: 'delivery-drivers', label: 'Entregadores', to: '/delivery/drivers', icon: Users, permission: 'delivery.manage_drivers' },
      { id: 'delivery-zones', label: 'Zonas de Entrega', to: '/delivery/rates', icon: SlidersHorizontal, permission: 'delivery.manage' },
    ],
  },
  {
    id: 'pos',
    label: 'PDV e Caixa',
    items: [
      { id: 'pos', label: 'Ponto de Venda', to: '/pos', icon: ShoppingCart, permission: 'pos.read' },
      { id: 'pos-tables', label: 'Gestão de Mesas', to: '/pos/tables', icon: QrCode, permission: 'pos.read' },
      { id: 'pos-printers', label: 'Impressoras', to: '/pos/printers', icon: Printer, permission: 'settings.manage' },
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
      { id: 'management-inventory-count', label: 'Inventário Físico', to: '/management/inventory-count', icon: ClipboardList, permission: 'inventory.adjust', featureFlag: 'VITE_FEATURE_INVENTORY_ADVANCED' },
      { id: 'management-losses', label: 'Perdas e Desperdícios', to: '/management/losses', icon: SlidersHorizontal, permission: 'inventory.adjust', featureFlag: 'VITE_FEATURE_INVENTORY_ADVANCED' },
      { id: 'management-finance', label: 'Financeiro / Fluxo', to: '/management/finance', icon: Wallet, permission: 'finance.read', featureFlag: 'VITE_FEATURE_FINANCE_ADVANCED' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM e Marketing',
    items: [
      { id: 'customers', label: 'Clientes (CRM)', to: '/customers', icon: Users, permission: 'crm.read' },
      { id: 'crm-dashboard', label: 'CRM Enterprise', to: '/crm/dashboard', icon: ChartLine, permission: 'crm.read', featureFlag: 'VITE_FEATURE_CRM_ADVANCED' },
      { id: 'marketing-automations', label: 'Automacoes', to: '/marketing/automations', icon: Bot, permission: 'crm.read', featureFlag: 'VITE_FEATURE_CAMPAIGNS' },
      { id: 'promotions', label: 'Promoções & Cupons', to: '/promotions', icon: Ticket, permission: 'crm.manage_coupons' },
    ],
  },
  {
    id: 'analytics',
    label: 'Gestão & Performance',
    items: [
      { id: 'analytics-reports', label: 'Relatórios Gerenciais', to: '/analytics/reports', icon: ChartLine, permission: 'reports.read' },
      { id: 'analytics-bi', label: 'Business Intelligence', to: '/analytics/business-intelligence', icon: BarChart3, permission: 'reports.read', featureFlag: 'VITE_FEATURE_BI_ADVANCED' },
      { id: 'analytics-goals', label: 'Metas e Desempenho', to: '/analytics/goals', icon: Goal, permission: 'goals.read', featureFlag: 'VITE_FEATURE_GOALS' },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    items: [
      { id: 'whatsapp-inbox', label: 'Caixa de Entrada', to: '/whatsapp/inbox', icon: MessageSquare, permission: 'orders.read', featureFlag: 'VITE_FEATURE_WHATSAPP_ADVANCED' },
      { id: 'whatsapp-campaigns', label: 'Campanhas', to: '/campaigns', icon: Megaphone, permission: 'crm.manage_coupons', featureFlag: 'VITE_FEATURE_CAMPAIGNS' },
      { id: 'whatsapp-config', label: 'WhatsApp', to: '/whatsapp/config', icon: Smartphone, permission: 'settings.manage', featureFlag: 'VITE_FEATURE_WHATSAPP_CONNECT' },
    ],
  },
  {
    id: 'system',
    label: 'Sistema',
    items: [
      { id: 'settings', label: 'Configurações', to: '/settings', icon: Settings, permission: 'settings.manage' },
      { id: 'settings-integrations', label: 'Integrações', to: '/settings/integrations', icon: Link2, permission: 'settings.manage', match: (p) => p === '/settings/integrations' },
      { id: 'settings-storefront', label: 'Personalizar Vitrine', to: '/settings/storefront', icon: Palette, permission: 'settings.manage' },
      { id: 'settings-scheduling', label: 'Agendamentos', to: '/settings/scheduling', icon: CalendarClock, permission: 'settings.manage' },
      { id: 'notifications', label: 'Notificações', to: '/settings/notifications', icon: Bell, permission: 'settings.manage' },
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

function SidebarGroupView(props: {
  group: SidebarGroup;
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
          className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-300 group ${isAnyItemActive
              ? 'bg-sidebar-active text-sidebar-active-foreground'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <span className="text-[10px] font-black uppercase tracking-[0.25em] transition-colors">
            {group.label}
          </span>
          <span
            className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : 'rotate-0'}`}
            aria-hidden
          >
            <ChevronRight className="h-3.5 w-3.5 opacity-50" aria-hidden />
          </span>
        </button>
      ) : (
        <div className="mx-auto w-8 h-px bg-muted/60 my-4" />
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
                      ? 'bg-primary text-primary-foreground shadow-lg dark:bg-sidebar-active dark:text-sidebar-active-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-hover dark:hover:bg-sidebar-hover hover:text-foreground'
                    } ${collapsed ? 'justify-center' : ''}`;
                }}
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex items-center justify-center transition-colors duration-300 ${isActive ? 'text-primary-foreground dark:text-sidebar-active-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} aria-hidden>
                      <item.icon className="h-[18px] w-[18px] stroke-[2.5px]" aria-hidden />
                    </span>
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {collapsed ? (
                      <span className="pointer-events-none absolute left-full ml-4 whitespace-nowrap rounded-xl bg-card border border-border px-3.5 py-2 text-xs font-black text-foreground opacity-0 shadow-2xl transition-all duration-300 translate-x-[-8px] group-hover:translate-x-0 group-hover:opacity-100 z-50 dark:bg-popover dark:text-popover-foreground">
                        {item.label}
                      </span>
                    ) : null}
                    {isActive && !collapsed && (
                      <span className="absolute right-3 w-1.5 h-1.5 rounded-full bg-primary-foreground dark:bg-sidebar-active-foreground animate-pulse" />
                    )}
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
  const { user, clearUser } = useAuthStore();
  const { theme, setTheme, initializeTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Inicializar tema apenas para rotas autenticadas
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [desktopSearch, setDesktopSearch] = useState('');
  const [storefrontBaseUrl, setStorefrontBaseUrl] = useState('');

  const { data: tenantData } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: async () => {
      const res = await api.get<Tenant & { settings: TenantSettings, operatingHours: TenantOperatingHours[] }>('/tenant/me');
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const queryClient = useQueryClient();
  const toggleStoreMutation = useMutation({
    mutationFn: async (isPaused: boolean) => {
      const res = await api.patch<unknown>('/tenant/store-pause', { 
        isStorePaused: isPaused, 
        storePauseReason: '' 
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings-applayout'] });
    },
    onError: (err) => {
      console.error('Erro ao alterar status:', err);
      alert('Erro ao alterar status da loja.');
    }
  });

  const storeStatus = useMemo((): 'open' | 'closed' | 'paused' => {
    if (!tenantData) return 'open';
    const settings = tenantData.settings;
    const isPaused = settings?.isStorePaused ?? false;
    if (isPaused) return 'paused';

    const operatingHours = tenantData.operatingHours || [];
    const timezone = settings?.timezone || 'America/Sao_Paulo';
    
    let localTimeStr: string;
    let localDayStr: string;
    try {
      localTimeStr = new Date().toLocaleTimeString('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
      localDayStr = new Date().toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' }).toLowerCase();
    } catch {
      localTimeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      localDayStr = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
    }

    const [hh, mm] = localTimeStr.split(':').map(Number);
    const currentMinutes = hh * 60 + mm;

    const weekdayMap: Record<string, number> = {
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
    };
    const dayOfWeek = weekdayMap[localDayStr] ?? 0;

    let rules = operatingHours;
    if (rules.length === 0) {
      if (!import.meta.env.DEV) {
        return 'closed';
      }
      rules = Array.from({ length: 7 }, (_, i) => ({
        id: `mock-${i}`,
        tenantId: tenantData.id,
        dayOfWeek: i,
        isOpen: true,
        openTime: '08:00',
        closeTime: '23:00',
      } as TenantOperatingHours));
    }

    const todayRule = rules.find((h: { dayOfWeek: number; isOpen: boolean; openTime: string | null; closeTime: string | null }) => h.dayOfWeek === dayOfWeek);

    if (todayRule?.isOpen && todayRule.openTime && todayRule.closeTime) {
      const [openH, openM] = todayRule.openTime.split(':').map(Number);
      const [closeH, closeM] = todayRule.closeTime.split(':').map(Number);
      const openMinutes = openH * 60 + openM;
      const closeMinutes = closeH * 60 + closeM;

      if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
        return 'open';
      }
    }

    return 'closed';
  }, [tenantData]);

  const handleToggleStore = () => {
    toggleStoreMutation.mutate(storeStatus !== 'paused');
  };

  // Audio Notifications Integration
  useNotificationAudio(tenantData?.id, {
    enabled: tenantData?.settings?.audioNotificationEnabled ?? true,
    volume: tenantData?.settings?.notificationVolume ?? 1.0,
    newOrderSound: tenantData?.settings?.newOrderSound,
    cancellationSound: tenantData?.settings?.cancellationSound,
    handoffSound: tenantData?.settings?.handoffSound,
    readySound: tenantData?.settings?.readySound,
  });

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
    for (const g of SIDEBAR_GROUPS) openGroups[g.id] = g.id === 'dashboard';
    return { collapsed: false, openGroups } satisfies SidebarState;
  }, []);

  const [collapsed, setCollapsed] = useState<boolean>(initialSidebarState.collapsed);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialSidebarState.openGroups);

  useEffect(() => {
    const next: SidebarState = { collapsed, openGroups };
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(next));
  }, [collapsed, openGroups]);

  const userPermissions = useMemo(() => user?.permissions ?? [], [user?.permissions]);
  const tenantSlug = user?.tenant?.slug;
  const publicMenuUrl = tenantSlug && storefrontBaseUrl ? `${storefrontBaseUrl}/${tenantSlug}` : '';

  useEffect(() => {
    const envBase = (import.meta.env.VITE_STOREFRONT_BASE_URL as string | undefined)?.trim();
    if (envBase) {
      setStorefrontBaseUrl(envBase.replace(/\/+$/, ''));
      return;
    }

    const { hostname, origin } = window.location;

    // Capacitor/Android: hostname é 'capacitor://localhost', não fazer parsing
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('capacitor://')) {
      // Em Capacitor ou localhost, usar variável de ambiente ou fallback seguro
      // Se não tiver VITE_STOREFRONT_BASE_URL configurado, usar a mesma origem da API
      const apiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
      if (apiBase && !apiBase.startsWith('/')) {
        // Extrair origin da API URL (removendo /api/v1 ou similar)
        const apiOrigin = apiBase.replace(/\/api\/v\d+.*$/, '');
        setStorefrontBaseUrl(apiOrigin);
        return;
      }
      // Fallback final: não definir storefrontBaseUrl em Capacitor sem config
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
    const filtered: SidebarGroup[] = [];
    for (const g of SIDEBAR_GROUPS) {
      const items = g.items
        .filter((it) => isFeatureVisible(it.featureFlag))
        .filter((it) => (it.permission ? hasPermission(userPermissions, it.permission) : true))
        .map((it) => it);

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



  return (
    <div className="app-shell min-h-screen flex transition-colors" style={{ backgroundColor: 'var(--surface-page)' }}>
      <Toaster
        position="top-right"
        containerClassName="safe-x"
        containerStyle={{
          top: 'calc(12px + var(--safe-area-top))',
          right: 'calc(12px + var(--safe-area-right))',
          left: 'calc(12px + var(--safe-area-left))',
        }}
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
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden safe-inset" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={closeMobile} />
      ) : null}

      <aside
        className={`tenant-sidebar fixed z-50 inset-y-0 left-0 flex flex-col transition-[transform,width,background-color] duration-200 ease-out md:static md:translate-x-0 ${
          collapsed ? 'w-[72px]' : 'w-64'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{ backgroundColor: 'var(--surface-base)', borderRight: '1px solid var(--border-default)' }}
        aria-label="Sidebar"
      >
        <div className={`p-4 flex flex-col gap-4 ${collapsed ? 'items-center' : ''}`} style={{ borderBottom: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between gap-3">
            {!collapsed ? (
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black text-xl shadow-lg shadow-primary/20 shrink-0 border-2 border-border">
                  G
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-sm font-black text-foreground tracking-tight truncate leading-tight flex items-center gap-1.5">
                    Gestor<span className="text-primary">PRO</span>
                  </h1>
                  <p className="text-[10px] font-black text-muted-foreground mt-1 truncate leading-none uppercase tracking-wider">{user?.tenant?.name || 'Carregando...'}</p>
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-black text-xl shadow-lg shadow-primary/20 border-2 border-border">
                G
              </div>
            )}
          </div>

          {!collapsed && (
            <div className="space-y-4">
              {/* Status Toggle Operational */}
              <button
                onClick={handleToggleStore}
                disabled={toggleStoreMutation.isPending}
                className={`w-full flex items-center justify-between p-2.5 rounded-2xl border transition-all duration-300 group hover:shadow-md active:scale-[0.98] ${
                  storeStatus === 'open'
                    ? 'bg-status-success/10 text-status-success border-status-success/30'
                    : storeStatus === 'closed'
                    ? 'bg-status-warning/10 text-status-warning border-status-warning/30'
                    : 'bg-destructive/10 text-destructive border-destructive/30'
                } ${toggleStoreMutation.isPending ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative flex h-2 w-2">
                    {storeStatus === 'open' && (
                      <span className="animate-ping absolute inset-0 rounded-full bg-status-success opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      storeStatus === 'open'
                        ? 'bg-status-success'
                        : storeStatus === 'closed'
                        ? 'bg-status-warning'
                        : 'bg-destructive'
                    }`} />
                  </div>
                  <span className="text-[10px] font-black tracking-widest uppercase">
                    {storeStatus === 'open'
                      ? 'Loja Aberta'
                      : storeStatus === 'paused'
                      ? 'Loja Pausada'
                      : 'Loja Fechada'}
                  </span>
                </div>
                <div className={`w-9 h-5 rounded-full relative transition-colors duration-300 ${
                  storeStatus === 'open'
                    ? 'bg-status-success/20'
                    : storeStatus === 'closed'
                    ? 'bg-status-warning/20'
                    : 'bg-destructive/20'
                }`}>
                   <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground border border-border transition-all duration-300 ${storeStatus === 'open' ? 'right-0.5' : 'left-0.5'}`} />
                </div>
              </button>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={publicMenuUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-border bg-card hover:bg-muted/50 hover:border-primary-500/30 transition-all group shadow-sm"
                >
                  <Globe className="w-4 h-4 text-primary-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Cardápio</span>
                </a>
                <button
                  type="button"
                  onClick={() => navigate('/settings/qr-codes')}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-border bg-card hover:bg-muted/50 hover:border-primary-500/30 transition-all group shadow-sm"
                >
                  <QrCode className="w-4 h-4 text-primary-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">QR Code</span>
                </button>
              </div>
            </div>
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
        <header className="desktop-header hidden md:flex sticky top-0 z-30 backdrop-blur-xl" style={{ backgroundColor: 'var(--surface-base)', borderBottom: '1px solid var(--border-default)' }}>
          <div className="h-16 px-6 flex items-center gap-4 w-full">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex items-center justify-center rounded-xl p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              aria-label="Alternar sidebar"
              title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>

            <div className="relative flex-1 max-w-[320px] lg:max-w-[520px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                value={desktopSearch}
                onChange={(e) => setDesktopSearch(e.target.value)}
                placeholder="Buscar (atalhos, páginas, ações)"
                className="input-premium pl-10"
              />
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-foreground hover:bg-muted transition-all"
                title="Atalhos"
              >
                <CornerDownRight className="h-4 w-4" aria-hidden />
                <span className="hidden xl:inline font-bold">Atalhos</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="inline-flex items-center justify-center w-10 h-10 p-0 rounded-full bg-muted text-foreground hover:bg-muted/80 transition-all border-none"
              title="Tema"
              aria-label="Alternar Tema"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            </button>

            <button
              type="button"
              className="inline-flex items-center justify-center w-10 h-10 p-0 rounded-full bg-muted/50 text-foreground hover:bg-muted transition-all"
              title="Notificações"
              aria-label="Notificações"
            >
              <Bell className="h-4 w-4" aria-hidden />
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1 sm:pr-3 text-sm font-bold text-foreground hover:bg-muted transition-all shadow-sm"
              title="Perfil"
            >
              <div className="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300 flex items-center justify-center">
                <UserCircle className="h-5 w-5" aria-hidden />
              </div>
              <span className="hidden lg:inline truncate max-w-[120px] xl:max-w-[180px]">{user?.name || 'Conta'}</span>
            </button>
          </div>
        </header>

        <header className="mobile-header md:hidden sticky top-0 z-30 backdrop-blur-xl transition-colors safe-x" style={{ backgroundColor: 'var(--surface-base)', borderBottom: '1px solid var(--border-default)' }}>
          <div className="h-14 px-4 flex items-center justify-between">
            <button
              type="button"
              onClick={openMobile}
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card w-10 h-10 text-foreground hover:bg-muted transition-all active:scale-95"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <div className="min-w-0 text-center">
              <div className="text-sm font-black text-foreground truncate flex items-center justify-center gap-1.5">
                Gestor<span className="text-primary-600">PRO</span>
              </div>
              <div className="text-[10px] font-bold text-muted-foreground truncate uppercase tracking-widest leading-none mt-0.5">{user?.tenant?.name || 'Carregando...'}</div>
            </div>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-muted text-muted-foreground transition-all active:scale-95"
            >
               {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>


        <main className="app-main flex-1 overflow-auto bg-background safe-bottom">
          <div key={location.pathname} className="h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
