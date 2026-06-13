import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/auth.store';
import { api } from '../../lib/api-client';
import { AlertTriangle, TrendingUp, Users, Store, CheckCircle2, Ticket } from 'lucide-react';

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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">SaaS Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Visão operacional da plataforma • Bem-vindo, <span className="font-medium text-foreground">{user?.name}</span>
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats && [
              { label: 'Tenants Ativos', value: stats.activeTenants, icon: CheckCircle2, text: 'text-emerald-500', bg: 'bg-emerald-500/10' },
              { label: 'Tenants Trial', value: stats.trialTenants, icon: TrendingUp, text: 'text-amber-500', bg: 'bg-amber-500/10' },
              { label: 'Total Registrados', value: stats.totalTenants, icon: Store, text: 'text-primary', bg: 'bg-primary/10' },
              { label: 'MRR Estimado', value: stats.mrr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), icon: Ticket, text: 'text-blue-500', bg: 'bg-blue-500/10' },
            ].map((card, i) => (
              <div
                key={i}
                className="bg-card rounded-xl border border-border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{card.label}</span>
                  <div className={`p-2 rounded-lg ${card.bg}`}>
                    <card.icon className={`w-5 h-5 ${card.text}`} />
                  </div>
                </div>
                <p className={`text-2xl font-black ${card.text}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-bold text-foreground mb-4">Alertas e Operação</h2>
                {stats?.supportTickets ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 w-6 h-6 flex-shrink-0" />
                    <div>
                      <h3 className="font-bold text-amber-700 dark:text-amber-400">Atenção Necessária</h3>
                      <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">Existem {stats.supportTickets} tickets ou alertas de suporte pendentes.</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center bg-muted/30 border border-dashed border-border rounded-lg">
                    <p className="font-bold text-muted-foreground">Tudo tranquilo 🎉</p>
                    <p className="text-sm text-muted-foreground mt-1">Nenhum alerta crítico ou tenant precisando de suporte urgente.</p>
                  </div>
                )}
              </div>
              
              <div className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-bold text-foreground mb-4">Financeiro Resumido</h2>
                <div className="p-8 text-center bg-muted/30 border border-dashed border-border rounded-lg">
                  <p className="font-bold text-muted-foreground">Sem dados históricos o suficiente</p>
                  <p className="text-sm text-muted-foreground mt-1">Os gráficos de churn e crescimento de MRR aparecerão aqui quando o gateway estiver conectado e houver faturamento recorrente.</p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-bold text-foreground mb-4">Atividade Recente</h2>
              {recentActivity.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">Nenhuma atividade recente.</p>
              ) : (
                <div className="space-y-4">
                  {recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 text-sm border-b border-border/50 pb-3 last:border-0 last:pb-0">
                      <div className="flex-1">
                        <p className="font-bold text-foreground">{activity.tenantName}</p>
                        <p className="text-muted-foreground">{activity.action}</p>
                      </div>
                      <span className="text-muted-foreground/60 text-[10px] uppercase font-bold tracking-wider">
                        {new Date(activity.createdAt).toLocaleDateString('pt-BR')}
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
