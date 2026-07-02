import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Loader2, Package, TrendingUp, Receipt, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.store';
import { api } from '../../lib/api-client';
import { BusinessGroupContext, Tenant, TenantSettings, TenantOperatingHours, ProductCategory, Product, DashboardStatsDTO } from '@gestor/types';
import { hasPermission } from '@gestor/auth';
import { SetupWizard } from './SetupWizard';

type DecimalLike = string | number;

type TenantBillingState = {
  hasBillingV2: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  source: 'billing_v2' | 'none';
  warning: string | null;
  plan: {
    name: string;
    allowAllModules: boolean;
  } | null;
};

type BillingUsagePreview = {
  billableAmount: DecimalLike;
  rating?: {
    selectedTier: { label: string | null } | null;
    currentMonthlyPrice: DecimalLike;
  };
};

function formatCurrency(value: DecimalLike): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function billingSourceLabel(source: string | undefined): string {
  if (source === 'billing_v2') return 'Billing V2';
  return 'Nenhuma assinatura';
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [operatingHours, setOperatingHours] = useState<TenantOperatingHours[]>([]);
  const [stats, setStats] = useState({ hasCategories: false, hasProducts: false });
  const [dashboardStats, setDashboardStats] = useState<DashboardStatsDTO | null>(null);
  const [billingState, setBillingState] = useState<TenantBillingState | null>(null);
  const [billingUsage, setBillingUsage] = useState<BillingUsagePreview | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);

  const { data: tenantData } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: async () => {
      const res = await api.get<Tenant & { settings: TenantSettings; operatingHours: TenantOperatingHours[]; businessGroup?: BusinessGroupContext | null }>('/tenant/me');
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadSetupData() {
      setSetupLoading(true);
      const [hoursRes, catRes, prodRes] = await Promise.allSettled([
        api.get<TenantOperatingHours[]>('/tenant/operating-hours'),
        api.get<ProductCategory[]>('/catalog/categories'),
        api.get<Product[]>('/catalog/products'),
      ]);

      if (cancelled) return;

      if (hoursRes.status === 'fulfilled' && hoursRes.value.success) {
        setOperatingHours(hoursRes.value.data);
      }

      setStats({
        hasCategories: catRes.status === 'fulfilled' && catRes.value.success && catRes.value.data.length > 0,
        hasProducts: prodRes.status === 'fulfilled' && prodRes.value.success && prodRes.value.data.length > 0,
      });
      setSetupLoading(false);
    }

    void loadSetupData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardStats() {
      if (!hasPermission(user?.permissions ?? [], 'reports.read')) {
        setDashboardStats(null);
        return;
      }

      setDashboardStatsLoading(true);
      const end = new Date();
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      try {
        const dashboardRes = await api.get<DashboardStatsDTO>(
          `/analytics/dashboard?startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`,
        );
        if (!cancelled) setDashboardStats(dashboardRes.success ? dashboardRes.data : null);
      } catch {
        if (!cancelled) setDashboardStats(null);
      } finally {
        if (!cancelled) setDashboardStatsLoading(false);
      }
    }

    void loadDashboardStats();

    return () => {
      cancelled = true;
    };
  }, [user?.permissions, user?.roles]);

  useEffect(() => {
    let cancelled = false;

    async function loadBillingData() {
      setBillingLoading(true);
      const [stateRes, usageRes] = await Promise.allSettled([
        api.get<TenantBillingState>('/billing/state'),
        api.get<BillingUsagePreview>('/billing/usage-preview'),
      ]);

      if (cancelled) return;

      setBillingState(stateRes.status === 'fulfilled' && stateRes.value.success ? stateRes.value.data : null);
      setBillingUsage(usageRes.status === 'fulfilled' && usageRes.value.success ? usageRes.value.data : null);
      setBillingLoading(false);
    }

    void loadBillingData();

    return () => {
      cancelled = true;
    };
  }, []);

  const summaryCards = [
    {
      label: 'Pedidos Hoje',
      value: String(dashboardStats?.operational?.totalOrders ?? 0),
      icon: Package,
    },
    {
      label: 'Faturamento',
      value: (dashboardStats?.commercial?.totalRevenue ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      icon: TrendingUp,
    },
    {
      label: 'Ticket Médio',
      value: (dashboardStats?.commercial?.averageTicket ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      icon: Receipt,
    },
    {
      label: 'Cancelamento',
      value: `${((dashboardStats?.operational?.cancellationRate ?? 0) * 100).toFixed(1)}%`,
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Bem-vindo de volta, <span className="font-bold text-gray-900 dark:text-gray-100">{user?.name}</span>
        </p>
      </div>

      {setupLoading ? (
        <div className="card-premium p-5 mb-8 flex items-center gap-3 text-sm font-bold text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
          Carregando checklist inicial...
        </div>
      ) : (
          <SetupWizard
            settings={tenantData?.settings ?? null}
            operatingHours={operatingHours}
            hasCategories={stats.hasCategories}
            hasProducts={stats.hasProducts}
          />
      )}

      {tenantData?.businessGroup ? (
        <div className="card-premium p-5 mb-8 border border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/20 dark:to-violet-950/20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-300">Grupo de Negócios</p>
              <h2 className="mt-1 text-xl font-black text-gray-900 dark:text-gray-100 truncate">{tenantData.businessGroup.name}</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Esta loja opera em uma rede multi-unidades. O vínculo é gerenciado no painel administrativo.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="bg-white/70 dark:bg-gray-900/60 rounded-xl px-4 py-3 border border-white/50 dark:border-gray-800">
                <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Lojas na rede</span>
                <span className="block mt-1 font-black text-gray-900 dark:text-gray-100">
                  {tenantData.businessGroup._count?.tenants ?? tenantData.businessGroup.tenants?.length ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

          <div className="card-premium p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
              <div>
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Plano atual</h2>
                <p className="mt-2 text-xl font-black text-gray-900 dark:text-gray-100">
                  {billingLoading ? 'Carregando plano...' : billingState?.plan?.name ?? billingSourceLabel(billingState?.source)}
                </p>
                <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                  Resumo de cobrança. Ajustes operacionais da loja continuam no checklist acima.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/billing')}
                className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-black uppercase tracking-widest text-primary-foreground transition hover:bg-primary/90"
              >
                <CreditCard className="h-4 w-4" />
                Ver plano e cobrança
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Status</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{billingLoading ? 'Carregando' : billingState?.subscriptionStatus ?? 'Indefinido'}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Faturamento apurado</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{billingLoading ? 'Calculando' : billingUsage ? formatCurrency(billingUsage.billableAmount) : 'Indisponível'}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Mensalidade estimada</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {billingLoading ? 'Calculando' : billingUsage?.rating ? formatCurrency(billingUsage.rating.currentMonthlyPrice) : 'Sem estimativa'}
                </span>
              </div>
            </div>

            {billingState?.warning ? (
              <p className="mt-4 text-xs font-bold text-amber-700 dark:text-amber-300">{billingState.warning}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="card-premium p-6 hover:-translate-y-1 hover:shadow-primary-500/10 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-2">
                  <card.icon className="h-6 w-6 text-primary-600 dark:text-primary-300" />
                </div>
                <p className="text-2xl font-black text-gray-900 dark:text-gray-100">
                  {dashboardStatsLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary-600" /> : card.value}
                </p>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="card-premium p-6">
            <h2 className="text-sm font-black text-gray-400 mb-6 uppercase tracking-widest">
              Sessão Atual
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Usuário</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{user?.email}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Tenant ID</span>
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400 break-all">{user?.tenantId}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Perfis</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {user?.roles.join(', ') || 'Nenhum'}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Permissões</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{user?.permissions.length || 0}</span>
              </div>
            </div>
          </div>
    </div>
  );
}
