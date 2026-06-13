import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api-client';
import { Activity, AlertTriangle, Building2, CheckCircle2, Clock, ExternalLink, RefreshCw, Search } from 'lucide-react';

interface HealthAlert {
  type: string;
  severity: string;
  message: string;
  createdAt: string;
}

interface HealthTenantListItem {
  tenantId: string;
  tenantName: string;
  slug: string;
  operationalStatus: string;
  billingStatus: string;
  createdAt: string;
  whatsapp: {
    status: string;
    connectedNumber: string | null;
    providerType: string;
    lastUpdatedAt: string;
  } | null;
  orders: {
    lastOrderAt: string;
    lastOrderTotal: string | number;
  } | null;
  alerts: HealthAlert[];
}

interface HealthOverviewResponse {
  items: HealthTenantListItem[];
  stats: {
    total: number;
    active: number;
    suspended: number;
    pastDue: number;
    trailing: number;
  };
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export function HealthPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<HealthTenantListItem[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0, pastDue: 0, trailing: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [billingFilter, setBillingFilter] = useState('');
  const [whatsappFilter, setWhatsappFilter] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('pageSize', '20');
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('operationalStatus', statusFilter);
      if (billingFilter) params.append('billingStatus', billingFilter);
      if (whatsappFilter) params.append('whatsappStatus', whatsappFilter);

      const res = await api.get<HealthOverviewResponse>(`/admin/tenants/health?${params.toString()}`);

      if (res?.success && res.data) {
        setTenants(res.data.items || []);
        if (res.data.stats) {
          setStats(res.data.stats);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados de saúde:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, searchTerm, statusFilter, billingFilter, whatsappFilter]);

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
            <select
              value={whatsappFilter}
              onChange={(e) => setWhatsappFilter(e.target.value)}
              className="px-3 py-2 bg-background border border-input rounded-md text-sm text-foreground outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">WhatsApp (Todos)</option>
              <option value="connected">Conectados</option>
              <option value="disconnected">Desconectados</option>
              <option value="qr_pending">Aguardando QR</option>
              <option value="none">Não configurado</option>
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
                <th className="px-6 py-4">Alertas</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    Nenhuma loja encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                tenants.map((t) => {
                  return (
                    <tr key={t.tenantId} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-foreground">{t.tenantName}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{t.slug}</div>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={t.operationalStatus} />
                      </td>
                      <td className="px-6 py-4">
                        <BillingBadge status={t.billingStatus} />
                      </td>
                      <td className="px-6 py-4">
                        <WhatsAppBadge whatsapp={t.whatsapp} />
                      </td>
                      <td className="px-6 py-4">
                        <LastOrderBadge order={t.orders} />
                      </td>
                      <td className="px-6 py-4">
                        {t.alerts && t.alerts.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {t.alerts.map((alert, idx) => (
                              <span key={idx} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${alert.severity === 'critical' ? 'bg-red-500/10 text-red-600' : alert.severity === 'high' ? 'bg-orange-500/10 text-orange-600' : 'bg-yellow-500/10 text-yellow-600'}`}>
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {alert.message}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem alertas</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-3 items-center">
                          <button
                            onClick={() => window.open(`/tenants/${t.tenantId}`, '_blank')}
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

function WhatsAppBadge({ whatsapp }: { whatsapp: HealthTenantListItem['whatsapp'] }) {
  if (!whatsapp) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 uppercase tracking-wider">Não configurado</span>;
  }
  
  if (whatsapp.status === 'connected') {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">Conectado</span>
        <span className="text-xs text-muted-foreground">{whatsapp.connectedNumber || 'Sem número'}</span>
      </div>
    );
  }

  if (whatsapp.status === 'disconnected') {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/20 uppercase tracking-wider">Desconectado</span>;
  }

  if (whatsapp.status === 'qr_pending') {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 uppercase tracking-wider">Aguardando QR</span>;
  }

  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 uppercase tracking-wider">{whatsapp.status}</span>;
}

function LastOrderBadge({ order }: { order: HealthTenantListItem['orders'] }) {
  if (!order) {
    return <span className="text-xs text-muted-foreground italic">Sem pedidos</span>;
  }
  
  try {
    const diffInSeconds = Math.floor((new Date().getTime() - new Date(order.lastOrderAt).getTime()) / 1000);
    let timeAgoStr = '';
    if (diffInSeconds < 60) timeAgoStr = `${diffInSeconds} segundos atrás`;
    else if (diffInSeconds < 3600) timeAgoStr = `${Math.floor(diffInSeconds / 60)} minutos atrás`;
    else if (diffInSeconds < 86400) timeAgoStr = `${Math.floor(diffInSeconds / 3600)} horas atrás`;
    else timeAgoStr = `${Math.floor(diffInSeconds / 86400)} dias atrás`;

    return (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{timeAgoStr}</span>
        <span className="text-xs text-muted-foreground">R$ {Number(order.lastOrderTotal).toFixed(2)}</span>
      </div>
    );
  } catch (err) {
    return <span className="text-xs text-muted-foreground">Data inválida</span>;
  }
}

