import { useAuthStore } from '../../stores/auth.store';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import { TenantSettings, TenantOperatingHours, ProductCategory, Product } from '@gestor/types';
import { SetupWizard } from './SetupWizard';
import { Loader2 } from 'lucide-react';

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

  useEffect(() => {
    async function loadOnboardingData() {
      try {
        const [meRes, hoursRes, catRes, prodRes] = await Promise.all([
          api.get<{ settings: TenantSettings }>('/tenant/me'),
          api.get<TenantOperatingHours[]>('/tenant/operating-hours'),
          api.get<ProductCategory[]>('/catalog/categories'),
          api.get<Product[]>('/catalog/products')
        ]);

        if (meRes.success) setSettings(meRes.data.settings);
        if (hoursRes.success) setOperatingHours(hoursRes.data);
        setStats({
          hasCategories: catRes.success && catRes.data.length > 0,
          hasProducts: prodRes.success && prodRes.data.length > 0
        });
      } catch (err) {
        console.error('Error loading onboarding data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadOnboardingData();
  }, []);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Bem-vindo de volta, <span className="font-bold text-gray-900">{user?.name}</span>
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

          {/* Info cards placeholder */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[
              { label: 'Pedidos Hoje', value: '0', icon: '📦' },
              { label: 'Faturamento', value: 'R$ 0,00', icon: '💰' },
              { label: 'Ticket Médio', value: 'R$ 0,00', icon: '📊' },
              { label: 'Em Preparo', value: '0', icon: '🍕' },
            ].map((card) => (
              <div
                key={card.label}
                className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-xl transition-all hover:-translate-y-1 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{card.icon}</span>
                </div>
                <p className="text-2xl font-black text-gray-900">{card.value}</p>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Session info */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <h2 className="text-lg font-black text-gray-900 mb-6 uppercase tracking-wider">
              Sessão Atual
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
              <div className="bg-gray-50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Usuário</span>
                <span className="font-bold text-gray-700">{user?.email}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Tenant ID</span>
                <span className="font-mono text-xs text-gray-500 break-all">{user?.tenantId}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Perfis</span>
                <span className="font-bold text-gray-700">
                  {user?.roles.join(', ') || 'Nenhum'}
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl">
                <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">Permissões</span>
                <span className="font-bold text-gray-700">{user?.permissions.length || 0}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
