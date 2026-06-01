import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PaginatedResponse, Tenant } from '@gestor/types';
import { Bot, CreditCard, ExternalLink } from 'lucide-react';
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

  const handleStatusChange = async (tenantId: string, newStatus: string) => {
    try {
      await api.patch(`/admin/tenants/${tenantId}/status`, { status: newStatus });
      setTenants((prev) => prev.map((tenant) => tenant.id === tenantId ? { ...tenant, status: newStatus as Tenant['status'] } : tenant));
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status do tenant');
    }
  };

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await api.get<{ accessToken: string }>(`/admin/tenants/${tenantId}/impersonate`);
      if (res.success && res.data.accessToken) {
        window.open(`http://localhost:5173?impersonate_token=${res.data.accessToken}`, '_blank');
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
        <p className="text-gray-500 mt-1">Lojas cadastradas na plataforma</p>
      </div>

      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Nome</th>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Slug</th>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Billing V2</th>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Criado em</th>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                  Nenhum tenant encontrado
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium">{tenant.name}</td>
                  <td className="px-6 py-4 text-gray-500 font-mono text-xs">{tenant.slug}</td>
                  <td className="px-6 py-4">
                    <StatusPill status={tenant.status} />
                  </td>
                  <td className="px-6 py-4">
                    <BillingCell tenant={tenant} />
                  </td>
                  <td className="px-6 py-4 text-gray-500">{new Date(tenant.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleImpersonate(tenant.id)}
                        className="text-green-600 hover:text-green-900 text-sm font-medium flex items-center gap-1"
                        title="Acessar painel como este tenant"
                      >
                        <ExternalLink size={14} />
                        Loja
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/tenants/${tenant.id}/modules`)}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                      >
                        Módulos
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/tenants/${tenant.id}/ai-agent`)}
                        className="text-purple-600 hover:text-purple-900 text-sm font-medium flex items-center gap-1"
                        title="Configurar Agente IA"
                      >
                        <Bot size={14} />
                        Agente IA
                      </button>
                      {!tenant.billingSubscriptions?.[0] ? (
                        <button
                          type="button"
                          onClick={() => handleCreateBillingV2(tenant.id)}
                          className="text-amber-700 hover:text-amber-900 text-sm font-medium flex items-center gap-1"
                          title="Criar assinatura Billing V2 sem gateway"
                        >
                          <CreditCard size={14} />
                          Billing V2
                        </button>
                      ) : null}
                      <select
                        value={tenant.status}
                        onChange={(event) => handleStatusChange(tenant.id, event.target.value)}
                        className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="active">Ativo</option>
                        <option value="trial">Trial</option>
                        <option value="suspended">Suspenso</option>
                        <option value="inactive">Inativo</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-4">
        {tenants.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
            Nenhum tenant encontrado
          </div>
        ) : (
          tenants.map((tenant) => (
            <div key={tenant.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-gray-900">{tenant.name}</h3>
                  <p className="text-xs text-gray-500 font-mono mt-1">{tenant.slug}</p>
                </div>
                <StatusPill status={tenant.status} />
              </div>

              <div className="text-xs text-gray-500 py-2 border-y border-gray-50">
                <span className="font-black uppercase tracking-widest text-gray-400">Billing V2</span>
                <div className="mt-1">
                  <BillingCell tenant={tenant} />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleImpersonate(tenant.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-50 text-green-700 rounded-lg text-xs font-bold"
                >
                  <ExternalLink size={14} />
                  Loja
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/tenants/${tenant.id}/modules`)}
                  className="flex-1 py-2.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold"
                >
                  Módulos
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/tenants/${tenant.id}/ai-agent`)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold"
                >
                  <Bot size={14} />
                  Agente IA
                </button>
              </div>

              {!tenant.billingSubscriptions?.[0] ? (
                <button
                  type="button"
                  onClick={() => handleCreateBillingV2(tenant.id)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold"
                >
                  <CreditCard size={14} />
                  Criar Billing V2
                </button>
              ) : null}

              <label className="block pt-2">
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Alterar status</span>
                <select
                  value={tenant.status}
                  onChange={(event) => handleStatusChange(tenant.id, event.target.value)}
                  className="w-full text-sm border-gray-200 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50"
                >
                  <option value="active">Ativo</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspenso</option>
                  <option value="inactive">Inativo</option>
                </select>
              </label>
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
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        status === 'active'
          ? 'bg-green-100 text-green-800'
          : status === 'trial'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-gray-100 text-gray-800'
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
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
          {subscription.status}
        </span>
        <p className="mt-1 text-xs text-gray-500">{subscription.billingPlan?.name ?? 'Billing V2'}</p>
      </div>
    );
  }

  return (
    <div>
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        Fallback legado
      </span>
      <p className="mt-1 text-xs text-gray-500">{tenant.subscription?.plan?.name ?? 'Sem assinatura V2'}</p>
    </div>
  );
}
