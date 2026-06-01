import { useAuthStore } from '../../stores/auth.store';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import { TenantSettings, TenantOperatingHours, ProductCategory, Product, DashboardStatsDTO } from '@gestor/types';
import { SetupWizard } from './SetupWizard';
import { Loader2 } from 'lucide-react';

type DecimalLike = string | number;

type TenantBillingState = {
  hasBillingV2: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  source: 'billing_v2' | 'legacy_fallback' | 'none';
  warning: string | null;
  plan: {
    name: string;
    allowAllModules: boolean;
  } | null;
  subscription: {
    currentCycleStartedAt: string | null;
    currentCycleEndsAt: string | null;
  } | null;
};

type BillingUsagePreview = {
  billableAmount: DecimalLike;
  rating?: {
    selectedTier: { label: string | null } | null;
    nextTier: { label: string | null } | null;
    currentMonthlyPrice: DecimalLike;
  };
};

function formatCurrency(value: DecimalLike): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sem data';
  return new Date(value).toLocaleDateString('pt-BR');
}

/**
 * Dashboard page — base placeholder for Phase 1.
 * Will be expanded with real operational widgets in Phase 2+.
 */
export function DashboardPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [operatingHours, setOperatingHours] = useState<TenantOperatingHours[]>([]);
  const [stats, setStats] = useState({ hasCategories: false, hasProducts: false });
  const [dashboardStats, setDashboardStats] = useState<DashboardStatsDTO | null>(null);
  const [billingState, setBillingState] = useState<TenantBillingState | null>(null);
  const [billingUsage, setBillingUsage] = useState<BillingUsagePreview | null>(null);

  useEffect(() => {
    async function loadOnboardingData() {
      try {
        const end = new Date();
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const [meRes, hoursRes, catRes, prodRes, billingStateRes] = await Promise.all([
          api.get<{ settings: TenantSettings }>('/tenant/me'),
          api.get<TenantOperatingHours[]>('/tenant/operating-hours'),
          api.get<ProductCategory[]>('/catalog/categories'),
          api.get<Product[]>('/catalog/products'),
          api.get<TenantBillingState>('/billing/state'),
        ]);

        if (meRes.success) setSettings(meRes.data.settings);
        if (billingStateRes.success) setBillingState(billingStateRes.data);
        if (hoursRes.success) setOperatingHours(hoursRes.data);
        setStats({
          hasCategories: catRes.success && catRes.data.length > 0,
          hasProducts: prodRes.success && prodRes.data.length > 0
        });

        try {
          const dashboardRes = await api.get<DashboardStatsDTO>(
            `/analytics/dashboard?startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`,
          );
          if (dashboardRes.success) setDashboardStats(dashboardRes.data);
        } catch {
          setDashboardStats(null);
        }

        try {
          const usageRes = await api.get<BillingUsagePreview>('/billing/usage-preview');
          if (usageRes.success) setBillingUsage(usageRes.data);
        } catch {
          setBillingUsage(null);
        }
      } catch (err) {
        setDashboardStats(null);
      } finally {
        setLoading(false);
      }
    }

    loadOnboardingData();
  }, []);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Bem-vindo de volta, <span className="font-bold text-gray-900 dark:text-gray-100">{user?.name}</span>
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
        </div>
      ) : (
        <>
          <SetupWizard 
            settings={settings}
            operatingHours={operatingHours}
            hasCategories={stats.hasCategories}
            hasProducts={stats.hasProducts}
          />

          <div className="card-premium p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Plano atual</h2>
                <p className="mt-2 text-xl font-black text-gray-900 dark:text-gray-100">
                  {billingState?.plan?.name ?? (billingState?.source === 'legacy_fallback' ? 'Plano legado' : 'Sem Billing V2')}
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-amber-50 dark:bg-amber-950/40 px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                Cobrança automática ainda não ativada
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Status</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{billingState?.subscriptionStatus ?? 'Indefinido'}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Trial termina em</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{formatDate(billingState?.trialEndsAt)}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Ciclo atual</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {formatDate(billingState?.subscription?.currentCycleStartedAt)} até {formatDate(billingState?.subscription?.currentCycleEndsAt)}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Faturamento apurado</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{billingUsage ? formatCurrency(billingUsage.billableAmount) : 'Calculando'}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Faixa atual</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{billingUsage?.rating?.selectedTier?.label ?? 'Sem faixa'}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Próxima faixa</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{billingUsage?.rating?.nextTier?.label ?? 'Última faixa'}</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Mensalidade estimada</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {billingUsage?.rating ? formatCurrency(billingUsage.rating.currentMonthlyPrice) : 'Sem estimativa'}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Origem</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">{billingState?.source ?? 'none'}</span>
              </div>
            </div>

            {billingState?.warning ? (
              <p className="mt-4 text-xs font-bold text-amber-700 dark:text-amber-300">{billingState.warning}</p>
            ) : null}
          </div>

          {/* Info cards placeholder */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[
              {
                label: 'Pedidos Hoje',
                value: String(dashboardStats?.operational?.totalOrders ?? 0),
                icon: '📦',
              },
              {
                label: 'Faturamento',
                value: (dashboardStats?.commercial?.totalRevenue ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                icon: '💰',
              },
              {
                label: 'Ticket Médio',
                value: (dashboardStats?.commercial?.averageTicket ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                icon: '📊',
              },
              {
                label: 'Cancelamento',
                value: `${((dashboardStats?.operational?.cancellationRate ?? 0) * 100).toFixed(1)}%`,
                icon: '⚠️',
              },
            ].map((card) => (
              <div
                key={card.label}
                className="card-premium p-6 hover:-translate-y-1 hover:shadow-primary-500/10 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{card.icon}</span>
                </div>
                <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{card.value}</p>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Session info */}
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
        </>
      )}
    </div>
  );
}
