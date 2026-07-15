import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PaginatedResponse, Tenant } from '@gestor/types';
import { ExternalLink } from 'lucide-react';
import { api } from '../../lib/api-client';

interface TenantListItem extends Tenant {
  _count?: { users: number; roles: number };
  billingSubscriptions?: Array<{
    id: string;
    status: string;
    trialEndsAt: string | null;
    billingPlan?: { name: string; slug: string } | null;
  }>;
  subscription?: { id: string; status: string; plan?: { name: string } | null } | null;
}

export function TenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTenants = () => {
    setLoading(true);
    api
      .get<PaginatedResponse<TenantListItem>>('/admin/tenants')
      .then((res) => setTenants(res.data.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filteredTenants = tenants.filter((t) => {
    const matchesSearch = searchTerm ? t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.slug.toLowerCase().includes(searchTerm.toLowerCase()) : true;
    const matchesStatus = statusFilter ? t.status === statusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const handleImpersonate = async (tenantId: string) => {
    const reason = window.prompt('Informe o motivo do acesso de suporte:')?.trim();
    if (!reason) return;

    try {
      const res = await api.post<{ accessToken: string }>(`/admin/tenants/${tenantId}/impersonate`, { reason });
      if (res.success && res.data.accessToken) {
        const tenantUrl = import.meta.env.VITE_TENANT_URL || 'http://localhost:5173';
        window.open(`${tenantUrl}?impersonate_token=${res.data.accessToken}`, '_blank');
      }
    } catch (error) {
      console.error('Erro ao impersonar:', error);
      alert('Erro ao acessar a loja');
    }
  };

  const handleCreateBillingV2 = async (tenantId: string) => {
    try {
      await api.post(`/admin/tenants/${tenantId}/billing-v2-subscription`, {});
      loadTenants();
    } catch (error) {
      console.error('Erro ao criar Billing V2:', error);
      alert('Erro ao criar assinatura Billing V2');
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenants</h1>
          <p className="text-muted-foreground mt-1">Lojas cadastradas na plataforma</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Buscar loja ou slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-sm border border-border bg-card text-foreground rounded-md px-3 py-2 focus:ring-primary focus:border-primary"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-border bg-card text-foreground rounded-md px-3 py-2 focus:ring-primary focus:border-primary"
          >
            <option value="">Todos Status</option>
            <option value="active">Ativo</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspenso</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>
      </div>

      <div className="hidden md:block bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-6 py-3 font-semibold text-foreground">Nome</th>
              <th className="text-left px-6 py-3 font-semibold text-foreground">Slug</th>
              <th className="text-left px-6 py-3 font-semibold text-foreground">Status</th>
              <th className="text-left px-6 py-3 font-semibold text-foreground">Billing V2</th>
              <th className="text-left px-6 py-3 font-semibold text-foreground">Criado em</th>
              <th className="text-left px-6 py-3 font-semibold text-foreground">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filteredTenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                  Nenhum tenant encontrado
                </td>
              </tr>
            ) : (
              filteredTenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">{tenant.name}</td>
                  <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{tenant.slug}</td>
                  <td className="px-6 py-4">
                    <StatusPill status={tenant.status} />
                  </td>
                  <td className="px-6 py-4">
                    <BillingCell tenant={tenant} />
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(tenant.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleImpersonate(tenant.id)}
                        className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium flex items-center gap-1"
                        title="Acessar painel como este tenant"
                      >
                        <ExternalLink size={14} />
                        Loja
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/tenants/${tenant.id}`)}
                        className="text-primary hover:underline text-sm font-bold ml-2"
                      >
                        Ver Detalhes &rarr;
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-4">
        {filteredTenants.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground text-sm">
            Nenhum tenant encontrado
          </div>
        ) : (
          filteredTenants.map((tenant) => (
            <div key={tenant.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-foreground">{tenant.name}</h3>
                  <p className="text-xs text-muted-foreground font-mono mt-1">{tenant.slug}</p>
                </div>
                <StatusPill status={tenant.status} />
              </div>

              <div className="text-xs text-muted-foreground py-2 border-y border-border/50">
                <span className="font-black uppercase tracking-widest text-muted-foreground/60">Billing V2</span>
                <div className="mt-1">
                  <BillingCell tenant={tenant} />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleImpersonate(tenant.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg text-xs font-bold"
                >
                  <ExternalLink size={14} />
                  Loja
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/tenants/${tenant.id}`)}
                  className="flex-1 py-2.5 bg-primary/10 text-primary rounded-lg text-xs font-bold"
                >
                  Ver Detalhes
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Tenant['status'] }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
        status === 'active'
          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400'
          : status === 'trial'
          ? 'bg-primary/10 text-primary border-primary/20'
          : 'bg-muted text-muted-foreground border-border'
      }`}
    >
      {status.toUpperCase()}
    </span>
  );
}

function BillingCell({ tenant }: { tenant: TenantListItem }) {
  const subscription = tenant.billingSubscriptions?.[0];
  if (subscription) {
    return (
      <div>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400">
          {subscription.status}
        </span>
        <p className="mt-1 text-xs text-muted-foreground">{subscription.billingPlan?.name ?? 'Billing V2'}</p>
      </div>
    );
  }

  return (
    <div>
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400">
        Fallback legado
      </span>
      <p className="mt-1 text-xs text-muted-foreground">{tenant.subscription?.plan?.name ?? 'Sem assinatura V2'}</p>
    </div>
  );
}
