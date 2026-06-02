import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/auth.store';
import { api } from '../../lib/api-client';

interface DashboardStats {
  activeTenants: number;
  trialTenants: number;
  totalTenants: number;
  mrr: number;
  supportTickets: number;
}

interface ActivityItem {
  id: string;
  tenantId: string;
  tenantName: string;
  action: string;
  resource: string | null;
  createdAt: string;
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        
        const [statsRes, activityRes] = await Promise.all([
          api.get<DashboardStats>('/admin/dashboard/stats'),
          api.get<{ items: ActivityItem[] }>('/admin/dashboard/recent-activity'),
        ]);

        if (statsRes.success) {
          setStats(statsRes.data);
        }

        if (activityRes.success) {
          setRecentActivity(activityRes.data.items);
        }
      } catch (error) {
        console.error('Erro ao carregar dados do dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">SaaS Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Bem-vindo, <span className="font-medium text-foreground">{user?.name}</span>
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {stats && [
              { label: 'Tenants Ativos', value: stats.activeTenants, icon: '🏪' },
              { label: 'Tenants Trial', value: stats.trialTenants, icon: '🔄' },
              { label: 'Total Tenants', value: stats.totalTenants, icon: '🏢' },
              { label: 'Receita MRR', value: stats.mrr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: '💰' },
            ].map((card) => (
              <div
                key={card.label}
                className="bg-card rounded-xl border border-border p-6 hover:shadow-md transition-shadow"
              >
                <span className="text-2xl">{card.icon}</span>
                <p className="text-2xl font-bold text-foreground mt-2">{card.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Sessão Admin</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">E-mail:</span>{' '}
                  <span className="font-medium text-foreground">{user?.email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Perfis:</span>{' '}
                  <span className="font-medium text-foreground">{user?.roles.join(', ') || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Permissões:</span>{' '}
                  <span className="font-medium text-foreground">{user?.permissions.length || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Atividade Recente</h2>
              {recentActivity.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma atividade recente</p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 text-sm">
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{activity.tenantName}</p>
                        <p className="text-muted-foreground">{activity.action}</p>
                      </div>
                      <span className="text-muted-foreground/60 text-xs">
                        {new Date(activity.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
