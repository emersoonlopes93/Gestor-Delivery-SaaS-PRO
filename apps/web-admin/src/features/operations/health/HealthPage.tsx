import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api-client';
import { Activity, AlertTriangle, Building2, CheckCircle2, Clock, ExternalLink, RefreshCw, Search } from 'lucide-react';

interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  _count?: { users: number; roles: number; orders?: number };
  billingSubscriptions?: Array<{
    id: string;
    status: string;
    trialEndsAt: string | null;
    billingPlan?: { name: string; slug: string } | null;
  }>;
  subscription?: { id: string; status: string; plan?: { name: string } | null } | null;
}

interface OverviewStats {
  totalTenants: number;
  tenantsWithBilling: number;
  draftInvoices: number;
}

export function HealthPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [billingFilter, setBillingFilter] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [tenantsRes, overviewRes] = await Promise.all([
        api.get<{ items: TenantListItem[] }>('/admin/tenants?pageSize=200').catch(() => null),
        api.get<OverviewStats>('/admin/billing/overview').catch(() => null),
      ]);

      if (tenantsRes?.success && tenantsRes.data?.items) {
        setTenants(tenantsRes.data.items);
      }
      if (overviewRes?.success && overviewRes.data) {
        setOverview(overviewRes.data);
      }
    } catch (err) {
      console.error('Erro ao carregar dados de saúde:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleImpersonate = async (tenantId: string) => {
    const reason = window.prompt('Informe o motivo do acesso de suporte:');
    if (!reason?.trim()) {
      alert('Acesso cancelado. O motivo é obrigatório.');
      return;
    }
    try {
      const res = await api.post<{ accessToken: string }>(`/admin/tenants/${tenantId}/impersonate`, { reason });
      if (res.success && res.data?.accessToken) {
        window.open(`http://localhost:5173?impersonate_token=${res.data.accessToken}`, '_blank');
      }
    } catch (error) {
      console.error('Erro ao impersonar:', error);
      alert('Erro ao acessar a loja.');
    }
  };

  // Estatísticas calculadas
  const stats = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter(t => t.status === 'active').length;
    const suspended = tenants.filter(t => t.status === 'suspended').length;
    let pastDue = 0;
    let trailing = 0;

    tenants.forEach(t => {
      const subStatus = t.billingSubscriptions?.[0]?.status ?? t.subscription?.status;
      if (subStatus === 'past_due' || subStatus === 'failed') pastDue++;
      if (subStatus === 'trialing' || subStatus === 'trial') trailing++;
    });

    return { total, active, suspended, pastDue, trailing };
  }, [tenants]);

  // Filtros aplicados
  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      const matchSearch = searchTerm ? t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.slug.toLowerCase().includes(searchTerm.toLowerCase()) : true;
      const matchStatus = statusFilter ? t.status === statusFilter : true;
      const subStatus = t.billingSubscriptions?.[0]?.status ?? t.subscription?.status ?? 'none';
      
      let matchBilling = true;
      if (billingFilter === 'past_due') matchBilling = subStatus === 'past_due' || subStatus === 'failed';
      else if (billingFilter === 'trial') matchBilling = subStatus === 'trial' || subStatus === 'trialing';
      else if (billingFilter === 'active') matchBilling = subStatus === 'active' || subStatus === 'paid' || subStatus === 'invoiced';
      else if (billingFilter === 'none') matchBilling = subStatus === 'none';

      return matchSearch && matchStatus && matchBilling;
    });
  }, [tenants, searchTerm, statusFilter, billingFilter]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Activity className="w-8 h-8 text-primary" /> Saúde dos Tenants
          </h1>
          <p className="mt-2 text-base font-medium text-muted-foreground">
            Monitoramento de status operacional, financeiro e alertas das lojas.
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border text-foreground rounded-lg hover:bg-muted text-sm font-bold transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar Dados
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Lojas Monitoradas</span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-foreground mt-2">{stats.total}</p>
        </div>
        
        <div className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Ativos & Operando</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{stats.active}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Trials & Avaliação</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">{stats.trailing}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Inadimplentes (Past Due)</span>
            <div className="p-2 rounded-lg bg-red-500/10 text-red-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-2">{stats.pastDue}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome ou slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Status Operacional (Todos)</option>
              <option value="active">Ativos</option>
              <option value="suspended">Suspensos</option>
              <option value="inactive">Inativos</option>
              <option value="trial">Trials</option>
            </select>
            <select
              value={billingFilter}
              onChange={(e) => setBillingFilter(e.target.value)}
              className="px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Status Financeiro (Todos)</option>
              <option value="active">Em dia</option>
              <option value="trial">Em trial</option>
              <option value="past_due">Em Atraso / Falha</option>
              <option value="none">Sem assinatura detectada</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground text-xs font-black uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Loja (Tenant)</th>
                <th className="px-6 py-4">Status Op.</th>
                <th className="px-6 py-4">Financeiro</th>
                <th className="px-6 py-4">WhatsApp</th>
                <th className="px-6 py-4">Últ. Pedido</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    Nenhuma loja encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => {
                  const subStatus = t.billingSubscriptions?.[0]?.status ?? t.subscription?.status ?? 'none';
                  
                  return (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-foreground">{t.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{t.slug}</div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-6 py-4">
                        <BillingBadge status={subStatus} />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 rounded-md text-[10px] font-bold tracking-wider">
                          NÃO AFERIDO
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 rounded-md text-[10px] font-bold tracking-wider">
                          NÃO AFERIDO
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-3 items-center">
                          <button
                            onClick={() => handleImpersonate(t.id)}
                            className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-bold text-xs flex items-center gap-1 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" /> Impersonar
                          </button>
                          <button
                            onClick={() => navigate(`/tenants/${t.id}`)}
                            className="text-primary hover:text-primary/80 font-bold text-xs transition-colors"
                          >
                            Ver Loja
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (['active'].includes(status)) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">{status}</span>;
  if (['trial'].includes(status)) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 uppercase tracking-wider">{status}</span>;
  if (['suspended', 'inactive'].includes(status)) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/20 uppercase tracking-wider">{status}</span>;
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border uppercase tracking-wider">{status}</span>;
}

function BillingBadge({ status }: { status: string }) {
  if (['active', 'paid', 'invoiced'].includes(status)) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">{status}</span>;
  if (['trial', 'trialing'].includes(status)) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">{status}</span>;
  if (['past_due', 'failed'].includes(status)) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/20 uppercase tracking-wider">{status}</span>;
  if (status === 'none') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border uppercase tracking-wider">SEM ASSINATURA</span>;
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-600 border border-slate-500/20 uppercase tracking-wider">{status}</span>;
}
