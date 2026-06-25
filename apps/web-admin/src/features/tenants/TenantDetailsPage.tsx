import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { Bot, Calendar, CreditCard, ExternalLink, Shield, Store, Puzzle, Package, Activity, AlertTriangle, ArrowLeft } from 'lucide-react';
import type { Tenant } from '@gestor/types';

interface TenantDetail extends Tenant {
  billingSubscriptions?: Array<{
    id: string;
    status: string;
    trialEndsAt: string | null;
    billingPlan?: { name: string; slug: string } | null;
  }>;
  subscription?: { id: string; status: string; plan?: { name: string } | null } | null;
  _count?: { users: number; roles: number; orders?: number };
}

interface ActivityItem {
  id: string;
  action: string;
  createdAt: string;
}

export function TenantDetailsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const loadTenant = async () => {
    try {
      setLoading(true);
      // Supondo que existe um endpoint individual ou pegando da lista
      try {
        const res = await api.get<{ data: TenantDetail } | TenantDetail>(`/admin/tenants/${tenantId}`);
        const data = ('data' in res) ? res.data : res;
        if (data) {
           setTenant(data as TenantDetail);
        }
      } catch (e) {
        // Fallback: se não houver endpoint de GET único, busca da lista
        const listRes = await api.get<{ data: { items: TenantDetail[] } }>(`/admin/tenants`);
        const items = listRes?.data?.data?.items || [];
        const found = items.find((t: TenantDetail) => t.id === tenantId);
        if (found) setTenant(found);
      }
    } catch (err) {
      console.error('Erro ao carregar tenant:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadActivity = async () => {
    try {
      setLoadingActivity(true);
      const res = await api.get<{ success: boolean; data: { items: ActivityItem[] } }>(`/admin/dashboard/recent-activity`);
      // Filtra localmente se a API não suportar query param
      if (res.success && res.data?.data?.items) {
         setActivity(res.data.data.items.slice(0, 5));
      }
    } catch (err) {
      console.error('Erro ao carregar atividade:', err);
    } finally {
      setLoadingActivity(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadTenant();
      loadActivity();
    }
  }, [tenantId]);

  const handleImpersonate = async () => {
    if (!tenant) return;
    const reason = window.prompt('Informe o motivo obrigatório para o acesso de suporte:');
    if (!reason?.trim()) {
      alert('Acesso cancelado. O motivo é obrigatório.');
      return;
    }

    try {
      const res = await api.post<{ accessToken: string }>(`/admin/tenants/${tenant.id}/impersonate`, { reason });
      if (res.success && res.data.accessToken) {
        const tenantUrl = import.meta.env.VITE_TENANT_URL || 'http://localhost:5173';
        window.open(`${tenantUrl}?impersonate_token=${res.data.accessToken}`, '_blank');
      }
    } catch (error) {
      console.error('Erro ao impersonar:', error);
      alert('Erro ao acessar a loja.');
    }
  };

  const handleChangeStatus = async (newStatus: string) => {
    if (!tenant) return;
    
    // Confirmação forte para inativar/suspender
    if (['suspended', 'inactive'].includes(newStatus)) {
      const confirmName = window.prompt(`Para confirmar, digite o nome exato da loja: ${tenant.name}`);
      if (confirmName !== tenant.name) {
        alert('Ação cancelada: O nome digitado não confere.');
        return;
      }
      const reason = window.prompt('Informe o motivo para esta ação restritiva:');
      if (!reason?.trim()) {
        alert('Ação cancelada: Motivo obrigatório.');
        return;
      }
    } else {
      const confirmed = window.confirm(`Deseja alterar o status desta loja para: ${newStatus.toUpperCase()}?`);
      if (!confirmed) return;
    }

    try {
      await api.patch(`/admin/tenants/${tenant.id}/status`, { status: newStatus });
      setTenant(prev => prev ? { ...prev, status: newStatus as TenantDetail['status'] } : null);
      alert('Status atualizado com sucesso.');
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status do tenant');
    }
  };

  const handleCreateAsaasSubscription = async () => {
    if (!tenant) return;
    const planId = window.prompt('Informe o ID do BillingPlan (ex: uuid do mvp-starter) ou deixe em branco para listar o padrao:');
    if (planId === null) return; // Cancelou
    
    try {
      await api.post(`/admin/billing/asaas/subscriptions/${tenant.id}`, { 
        planId: planId.trim(), 
        cycle: 'MONTHLY',
        billingType: 'PIX'
      });
      alert('Assinatura Asaas gerada com sucesso! Recarregando...');
      loadTenant();
    } catch (err: unknown) {
      const error = err as Error & { response?: { data?: { message?: string } } };
      alert('Erro ao gerar assinatura: ' + (error?.response?.data?.message || error.message));
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/tenants')} className="flex items-center text-sm text-muted-foreground mb-4 hover:text-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar para Lojas
        </button>
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground">Loja não encontrada</h2>
          <p className="text-muted-foreground mt-2">O tenant solicitado não existe ou você não tem permissão para acessá-lo.</p>
        </div>
      </div>
    );
  }

  const subV2 = tenant.billingSubscriptions?.[0];
  const billingPlanName = subV2?.billingPlan?.name ?? tenant.subscription?.plan?.name ?? 'Sem Plano V2';
  const billingStatus = subV2?.status ?? tenant.subscription?.status ?? 'Sem Assinatura';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate('/tenants')} className="flex items-center text-sm text-muted-foreground mb-2 hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar para Lojas
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{tenant.name}</h1>
              <p className="text-muted-foreground font-mono text-sm">{tenant.slug}</p>
            </div>
            <StatusBadge status={tenant.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleImpersonate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg text-sm font-bold hover:bg-green-500/20 transition-colors"
          >
            <ExternalLink size={16} />
            Impersonar Loja
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Coluna Principal */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Visão Operacional
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <span className="text-xs text-muted-foreground font-bold uppercase">Data de Criação</span>
                <p className="font-medium text-foreground mt-1">{new Date(tenant.createdAt).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <span className="text-xs text-muted-foreground font-bold uppercase">Usuários Admin</span>
                <p className="font-medium text-foreground mt-1">{tenant._count?.users ?? 'N/A'}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <span className="text-xs text-muted-foreground font-bold uppercase">Total de Pedidos</span>
                <p className="font-medium text-foreground mt-1">{tenant._count?.orders ?? 'Indisponível'}</p>
              </div>
              <div className="bg-muted/50 p-4 rounded-lg">
                <span className="text-xs text-muted-foreground font-bold uppercase">WhatsApp</span>
                <p className="font-medium text-foreground mt-1 text-sm">Status no painel da loja</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" /> Financeiro / Billing
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div className="border border-border rounded-lg p-4">
                 <p className="text-sm text-muted-foreground">Plano Contratado</p>
                 <p className="text-lg font-bold text-foreground mt-1">{billingPlanName}</p>
               </div>
               <div className="border border-border rounded-lg p-4">
                 <p className="text-sm text-muted-foreground">Status do Pagamento</p>
                 <div className="mt-1">
                   <StatusBadge status={billingStatus} />
                 </div>
               </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2">
               <button
                  onClick={() => navigate('/billing')}
                  className="text-primary text-sm font-bold hover:underline text-left"
               >
                 Acessar Console de Billing para simulações completas &rarr;
               </button>
               {(!subV2?.id || billingStatus === 'Sem Assinatura') && (
                 <button
                    onClick={handleCreateAsaasSubscription}
                    className="text-blue-500 text-sm font-bold hover:underline text-left mt-2"
                 >
                   Gerar Assinatura Asaas (PIX / Mensal) &rarr;
                 </button>
               )}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Auditoria Recente
            </h2>
            {loadingActivity ? (
               <p className="text-sm text-muted-foreground">Carregando logs...</p>
            ) : activity.length > 0 ? (
               <div className="space-y-3">
                 {activity.map(act => (
                   <div key={act.id} className="flex justify-between items-center text-sm p-3 bg-muted/30 rounded-lg">
                     <span className="font-medium text-foreground">{act.action}</span>
                     <span className="text-muted-foreground text-xs">{new Date(act.createdAt).toLocaleString('pt-BR')}</span>
                   </div>
                 ))}
               </div>
            ) : (
               <p className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-lg">Nenhum evento recente encontrado.</p>
            )}
            <div className="mt-4 text-right">
               <button
                  onClick={() => navigate('/audit-logs')}
                  className="text-primary text-sm font-bold hover:underline"
               >
                 Ver todos os logs &rarr;
               </button>
            </div>
          </div>
        </div>

        {/* Coluna Lateral */}
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-sm font-bold text-foreground mb-4 uppercase tracking-widest text-muted-foreground">Atalhos da Loja</h2>
            <div className="space-y-2">
              <button
                onClick={() => navigate(`/tenants/${tenant.id}/modules`)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Package className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-medium">Módulos</span>
                </div>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate(`/tenants/${tenant.id}/access`)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium">Acessos e recursos</span>
                </div>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate(`/tenants/${tenant.id}/scheduling`)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-cyan-500" />
                  <span className="text-sm font-medium">Agendamento</span>
                </div>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate(`/tenants/${tenant.id}/ai-agent`)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Bot className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-medium">Agente IA</span>
                </div>
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 border-t-4 border-t-amber-500">
            <h2 className="text-sm font-bold text-foreground mb-4 uppercase tracking-widest text-amber-500">Ações Críticas</h2>
            <div className="space-y-3">
              {tenant.status !== 'active' && (
                <button
                  onClick={() => handleChangeStatus('active')}
                  className="w-full text-left px-4 py-2 bg-emerald-500/10 text-emerald-600 rounded-lg text-sm font-bold hover:bg-emerald-500/20"
                >
                  Ativar Loja
                </button>
              )}
              {tenant.status !== 'suspended' && (
                <button
                  onClick={() => handleChangeStatus('suspended')}
                  className="w-full text-left px-4 py-2 bg-amber-500/10 text-amber-600 rounded-lg text-sm font-bold hover:bg-amber-500/20"
                >
                  Suspender Loja
                </button>
              )}
              {tenant.status !== 'inactive' && (
                <button
                  onClick={() => handleChangeStatus('inactive')}
                  className="w-full text-left px-4 py-2 bg-red-500/10 text-red-600 rounded-lg text-sm font-bold hover:bg-red-500/20"
                >
                  Inativar Loja
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  let color = 'bg-muted text-muted-foreground border-border';
  if (['active', 'paid', 'invoiced'].includes(status)) color = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400';
  if (['trial', 'trialing'].includes(status)) color = 'bg-primary/10 text-primary border-primary/20';
  if (['past_due', 'suspended', 'failed', 'inactive'].includes(status)) color = 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {status.toUpperCase()}
    </span>
  );
}
