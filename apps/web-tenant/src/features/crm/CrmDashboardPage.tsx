import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  ClipboardList,
  HeartPulse,
  RefreshCw,
  Star,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api-client';

type DashboardPayload = {
  indicators: {
    activeCustomers: number;
    atRiskCustomers: number;
    recoveredCustomers: number;
    vipCustomers: number;
    averageTicket: number;
    averageFrequency: number;
    estimatedChurn: number;
  };
  segments: {
    totalCustomers: number;
    vip: number;
    frequent: number;
    inactive30: number;
    inactive60: number;
    inactive90: number;
    atRisk: number;
    newCustomers: number;
  };
};

type PipelinePayload = {
  stages: Record<'lead' | 'prospect' | 'customer' | 'vip_customer' | 'at_risk_customer' | 'recovered_customer', number>;
  customers: Array<{
    customerId: string;
    name: string;
    phone: string;
    stage: string;
    reason: string;
    healthScore: number;
  }>;
};

type RecommendationsPayload = {
  recommendations: Array<{
    type: string;
    priority: 'high' | 'medium' | 'low';
    customerId: string;
    customerName: string;
    message: string;
    recommendedAction: string;
  }>;
};

type CrmTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  customer: { name: string; phone: string };
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const PIPELINE_LABELS: Record<string, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  customer: 'Cliente',
  vip_customer: 'Cliente VIP',
  at_risk_customer: 'Cliente em Risco',
  recovered_customer: 'Cliente Recuperado',
};

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function CrmDashboardPage() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['crm-enterprise-dashboard'],
    queryFn: async () => {
      const res = await api.get<DashboardPayload>('/crm/dashboard');
      return res.data;
    },
  });

  const { data: pipeline } = useQuery({
    queryKey: ['crm-enterprise-pipeline'],
    queryFn: async () => {
      const res = await api.get<PipelinePayload>('/crm/pipeline');
      return res.data;
    },
  });

  const { data: recommendations } = useQuery({
    queryKey: ['crm-enterprise-recommendations'],
    queryFn: async () => {
      const res = await api.get<RecommendationsPayload>('/crm/recommendations');
      return res.data;
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ['crm-enterprise-tasks'],
    queryFn: async () => {
      const res = await api.get<CrmTask[]>('/crm/tasks');
      return res.data;
    },
  });

  const indicators = dashboard?.indicators;
  const stages = pipeline?.stages;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">CRM Enterprise</h1>
          <p className="text-sm text-muted-foreground">Dashboard unificado de clientes, risco, fidelidade e campanhas.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground">
          <RefreshCw className="h-4 w-4" />
          CustomerIntelligenceService
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric title="Clientes ativos" value={indicators?.activeCustomers ?? 0} icon={Users} />
        <Metric title="Clientes em risco" value={indicators?.atRiskCustomers ?? 0} icon={AlertTriangle} tone="warning" />
        <Metric title="Clientes recuperados" value={indicators?.recoveredCustomers ?? 0} icon={RefreshCw} tone="success" />
        <Metric title="VIPs" value={indicators?.vipCustomers ?? 0} icon={Star} tone="vip" />
        <Metric title="Ticket medio" value={currency.format(indicators?.averageTicket ?? 0)} icon={BadgeCheck} />
        <Metric title="Frequencia media" value={(indicators?.averageFrequency ?? 0).toFixed(2)} icon={ClipboardList} />
        <Metric title="Churn estimado" value={percent(indicators?.estimatedChurn ?? 0)} icon={HeartPulse} tone="warning" />
        <Metric title="Base total" value={dashboard?.segments.totalCustomers ?? 0} icon={Users} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        <section className="rounded-lg border border-border bg-card">
          <div className="p-5 border-b border-border">
            <h2 className="text-lg font-black text-foreground">Pipeline CRM</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-6 divide-x divide-border border-b border-border">
            {Object.entries(stages ?? {}).map(([stage, count]) => (
              <div key={stage} className="p-4 min-h-24">
                <p className="text-xs font-bold text-muted-foreground">{PIPELINE_LABELS[stage]}</p>
                <p className="mt-2 text-2xl font-black text-foreground">{count}</p>
              </div>
            ))}
            {!stages && (
              <div className="col-span-full p-6 text-sm text-muted-foreground">
                {isLoading ? 'Carregando pipeline...' : 'Sem dados de pipeline.'}
              </div>
            )}
          </div>
          <div className="divide-y divide-border">
            {(pipeline?.customers ?? []).slice(0, 8).map((customer) => (
              <div key={customer.customerId} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">{customer.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{customer.reason}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
                    {PIPELINE_LABELS[customer.stage] ?? customer.stage}
                  </span>
                  <span className="w-12 text-right text-sm font-black text-foreground">{customer.healthScore}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="p-5 border-b border-border flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-black text-foreground">IA Comercial CRM</h2>
          </div>
          <div className="divide-y divide-border">
            {(recommendations?.recommendations ?? []).slice(0, 8).map((item) => (
              <div key={`${item.type}-${item.customerId}`} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-foreground">{item.customerName}</p>
                  <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${priorityClass(item.priority)}`}>
                    {item.priority}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.recommendedAction}</p>
              </div>
            ))}
            {!(recommendations?.recommendations ?? []).length && (
              <div className="p-6 text-sm text-muted-foreground">Nenhuma recomendacao pendente.</div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-black text-foreground">Tarefas e follow-ups</h2>
        </div>
        <div className="divide-y divide-border">
          {(tasks ?? []).slice(0, 6).map((task) => (
            <div key={task.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-foreground">{task.title}</p>
                <p className="text-xs text-muted-foreground">{task.customer.name} - {task.customer.phone}</p>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
                {task.dueAt ? new Date(task.dueAt).toLocaleDateString('pt-BR') : task.status}
              </span>
            </div>
          ))}
          {!(tasks ?? []).length && <div className="p-6 text-sm text-muted-foreground">Sem tarefas abertas.</div>}
        </div>
      </section>
    </div>
  );
}

function Metric({
  title,
  value,
  icon: Icon,
  tone = 'default',
}: {
  title: string;
  value: string | number;
  icon: typeof Users;
  tone?: 'default' | 'warning' | 'success' | 'vip';
}) {
  const toneClass = {
    default: 'bg-primary/10 text-primary',
    warning: 'bg-status-warning/10 text-status-warning',
    success: 'bg-status-success/10 text-status-success',
    vip: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300',
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-black text-foreground">{value}</p>
        </div>
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function priorityClass(priority: 'high' | 'medium' | 'low') {
  if (priority === 'high') return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300';
  if (priority === 'medium') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300';
  return 'bg-muted text-muted-foreground';
}
