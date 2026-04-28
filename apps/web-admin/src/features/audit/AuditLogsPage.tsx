import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api-client';
import { Shield, ChevronLeft, ChevronRight, Filter, RefreshCw } from 'lucide-react';

interface AuditLogItem {
  id: string;
  tenantId: string;
  userId: string | null;
  userType: string;
  action: string;
  resource: string | null;
  details: any;
  ip: string | null;
  createdAt: string;
  tenant: { id: string; name: string; slug: string };
}

interface PaginatedResult {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function AuditLogsPage() {
  const [data, setData] = useState<PaginatedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [tenantFilter, setTenantFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '25');
      if (tenantFilter) params.set('tenantId', tenantFilter);
      if (actionFilter) params.set('action', actionFilter);

      const res = await api.get<PaginatedResult>(`/admin/audit-logs?${params.toString()}`);
      setData(res.data);
    } catch (err) {
      console.error('Erro ao carregar audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, tenantFilter, actionFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const actionBadgeColor = (action: string) => {
    if (action.includes('create') || action.includes('register')) return 'bg-green-100 text-green-800';
    if (action.includes('delete') || action.includes('remove')) return 'bg-red-100 text-red-800';
    if (action.includes('update') || action.includes('edit')) return 'bg-blue-100 text-blue-800';
    if (action.includes('login') || action.includes('auth')) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary-600" />
            Logs de Auditoria
          </h1>
          <p className="text-gray-500 mt-1">
            Registro de ações realizadas na plataforma
            {data && <span className="ml-2 text-xs text-gray-400">({data.total} registros)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showFilters 
                ? 'bg-primary-50 border-primary-200 text-primary-700' 
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Tenant ID
            </label>
            <input
              type="text"
              placeholder="UUID do tenant..."
              value={tenantFilter}
              onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-200 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Ação
            </label>
            <input
              type="text"
              placeholder="Ex: order.create"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-200 focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setTenantFilter(''); setActionFilter(''); setPage(1); }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Nenhum log encontrado</p>
            <p className="text-gray-400 text-sm mt-1">
              Os logs de auditoria são gerados automaticamente quando ações são realizadas no sistema.
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">Data/Hora</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">Tenant</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">Ação</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">Recurso</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">Tipo</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-700">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900 text-xs">{log.tenant?.name || '—'}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{log.tenant?.slug || log.tenantId}</div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${actionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{log.resource || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        log.userType === 'admin' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {log.userType}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-400 text-xs font-mono">{log.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between bg-gray-50">
              <div className="text-xs text-gray-500">
                Página {data.page} de {data.totalPages} · Total: {data.total}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </button>
                <button
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Próxima
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
