import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api-client';
import { Shield, ChevronLeft, ChevronRight, Filter, RefreshCw } from 'lucide-react';
import { 
  PageHeader, 
  Button, 
  Card, 
  StatusBadge, 
  Badge,
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell,
  Input,
  FormField
} from '@gestor/ui';

interface AuditLogItem {
  id: string;
  tenantId: string;
  userId: string | null;
  userType: string;
  action: string;
  resource: string | null;
  details: Record<string, unknown> | null;
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

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Logs de Auditoria"
        description="Registro de ações realizadas na plataforma"
        icon={Shield}
        action={
          <div className="flex gap-2">
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filtros
            </Button>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      {/* Filters Panel */}
      {showFilters && (
        <Card className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Tenant ID">
            <Input
              placeholder="UUID do tenant..."
              value={tenantFilter}
              onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }}
            />
          </FormField>
          <FormField label="Ação">
            <Input
              placeholder="Ex: order.create"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            />
          </FormField>
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => { setTenantFilter(''); setActionFilter(''); setPage(1); }}
            >
              Limpar filtros
            </Button>
          </div>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Recurso</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-gray-500 whitespace-nowrap text-xs">
                      {new Date(log.createdAt).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-gray-900 text-xs">{log.tenant?.name || '—'}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{log.tenant?.slug || log.tenantId}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={
                          log.action.includes('create') || log.action.includes('register') ? 'success' :
                          log.action.includes('delete') || log.action.includes('remove') ? 'error' :
                          log.action.includes('update') || log.action.includes('edit') ? 'info' :
                          log.action.includes('login') || log.action.includes('auth') ? 'warning' :
                          'neutral'
                        }
                      >
                        {log.action}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-gray-500 text-xs">{log.resource || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={log.userType === 'admin' ? 'secondary' : 'outline'}>
                        {log.userType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-400 text-xs font-mono">{log.ip || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between bg-muted/30">
              <div className="text-xs text-gray-500">
                Página {data.page} de {data.totalPages} · Total: {data.total}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
