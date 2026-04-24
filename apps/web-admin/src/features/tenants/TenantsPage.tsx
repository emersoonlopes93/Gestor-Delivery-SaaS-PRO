import { useEffect, useState } from 'react';
import type { Tenant, PaginatedResponse } from '@gestor/types';
import { api } from '../../lib/api-client';
import { ExternalLink } from 'lucide-react';

interface TenantListItem extends Tenant {
  _count?: { users: number; roles: number };
}

/**
 * Tenants management page — lists all tenants in the platform.
 */
export function TenantsPage() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const handleStatusChange = async (tenantId: string, newStatus: string) => {
    try {
      await api.patch(`/admin/tenants/${tenantId}/status`, { status: newStatus });
      setTenants(prev => 
        prev.map(t => t.id === tenantId ? { ...t, status: newStatus as any } : t)
      );
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status do tenant');
    }
  };

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await api.get<{ accessToken: string }>(`/admin/tenants/${tenantId}/impersonate`);
      if (res.success && res.data.accessToken) {
        // Em desenvolvimento local o tenant-web roda na porta 5173
        const tenantUrl = `http://localhost:5173?impersonate_token=${res.data.accessToken}`;
        window.open(tenantUrl, '_blank');
      }
    } catch (error) {
      console.error('Erro ao impersonar:', error);
      alert('Erro ao acessar a loja');
    }
  };

  useEffect(() => {
    api
      .get<PaginatedResponse<TenantListItem>>('/admin/tenants')
      .then((res) => {
        setTenants(res.data.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
        <p className="text-gray-500 mt-1">Lojas cadastradas na plataforma</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Nome</th>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Slug</th>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Criado em</th>
              <th className="text-left px-6 py-3 font-semibold text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  Nenhum tenant encontrado
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium">{tenant.name}</td>
                  <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                    {tenant.slug}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        tenant.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : tenant.status === 'trial'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {tenant.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(tenant.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleImpersonate(tenant.id)}
                        className="text-green-600 hover:text-green-900 text-sm font-medium flex items-center gap-1"
                        title="Acessar painel como este tenant"
                      >
                        <ExternalLink size={14} />
                        Loja
                      </button>
                      <button
                        onClick={() => window.location.href = `/tenants/${tenant.id}/modules`}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                      >
                        Módulos
                      </button>
                      <select
                        value={tenant.status}
                        onChange={(e) => handleStatusChange(tenant.id, e.target.value)}
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
    </div>
  );
}
