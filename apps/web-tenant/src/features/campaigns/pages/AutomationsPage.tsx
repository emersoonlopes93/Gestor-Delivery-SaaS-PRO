import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Clock, DollarSign, Megaphone, PauseCircle, RefreshCw, Send, ShoppingCart, Sparkles, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { PageHeader, Button, Card, StatusBadge, EmptyState } from '@gestor/ui';

type RecoveryScenario = {
  days: 30 | 60 | 90;
  audience: number;
  message: string;
};

type DueCart = {
  sessionId: string;
  phone: string;
  displayName?: string | null;
  step: '30m' | '2h' | '24h';
  minutesInactive: number;
};

type AutomationsPayload = {
  recovery: RecoveryScenario[];
  abandonedCarts: DueCart[];
  automations: Array<{ id: string; name: string; enabled: boolean }>;
  center?: {
    active: Array<{ id: string; name: string; status: string }>;
    paused: Array<{ id: string; name: string; status: string }>;
    lastExecutions: Array<{
      id: string;
      name: string;
      objective?: string | null;
      status: string;
      startedAt?: string | null;
      completedAt?: string | null;
      sent: number;
      converted: number;
    }>;
    totals: {
      sent: number;
      delivered: number;
      read: number;
      clicked: number;
      converted: number;
      optOuts: number;
      failures: number;
      revenueGenerated: number;
    };
  };
};

type RevenueKpis = {
  averageTicket: number;
  ltv: number;
  purchaseFrequency: number;
  retentionRate: number;
  reactivationRate: number;
  recoveredRevenue: number;
  upsellConversionRate: number;
  campaignConversionRate: number;
  revenueLast30Days: number;
};

type InsightsPayload = {
  insights: Array<{ type: string; severity: 'info' | 'success' | 'warning'; message: string; value?: number }>;
};

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function AutomationConfigCard({ 
  title, 
  description, 
  type, 
  configs, 
  onSave, 
  defaultTemplate,
  extraConfigUI 
}: {
  title: string;
  description: string;
  type: string;
  configs?: Array<{ type: string; enabled: boolean; messageTemplate: string; config: Record<string, unknown> }>;
  onSave: (data: { type: string; payload: { enabled: boolean; messageTemplate: string; config: Record<string, unknown> } }) => void;
  defaultTemplate: string;
  extraConfigUI: (config: Record<string, unknown>, setConfig: (c: Record<string, unknown>) => void) => React.ReactNode;
}) {
  const config = configs?.find(c => c.type === type);
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [template, setTemplate] = useState(config?.messageTemplate ?? defaultTemplate);
  const [localConfig, setLocalConfig] = useState(config?.config ?? {});

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span className="text-sm">Habilitado</span>
      </div>
      <textarea
        className="w-full p-2 border rounded-md text-sm min-h-[80px]"
        value={template}
        onChange={(e) => setTemplate(e.target.value)}
      />
      {extraConfigUI(localConfig, setLocalConfig)}
      <Button size="sm" onClick={() => onSave({ type, payload: { enabled, messageTemplate: template, config: localConfig } })}>
        Salvar
      </Button>
    </Card>
  );
}

export function AutomationsPage() {
  const queryClient = useQueryClient();

  const { data: automations, isLoading } = useQuery({
    queryKey: ['marketing-automations'],
    queryFn: async () => {
      const res = await api.get<AutomationsPayload>('/campaigns/automations');
      return res.success ? res.data : { recovery: [], abandonedCarts: [], automations: [] };
    },
  });

  const { data: kpis } = useQuery({
    queryKey: ['crm-intelligence-kpis'],
    queryFn: async () => {
      const res = await api.get<RevenueKpis>('/crm/customers/intelligence/kpis');
      return res.success ? res.data : null;
    },
  });

  const { data: insights } = useQuery({
    queryKey: ['business-insights'],
    queryFn: async () => {
      const res = await api.get<InsightsPayload>('/analytics/insights');
      return res.success ? res.data : { insights: [] };
    },
  });

  const recoveryMutation = useMutation({
    mutationFn: async (days: 30 | 60 | 90) => {
      await api.post(`/campaigns/recovery/${days}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-automations'] }),
  });

  const abandonedCartMutation = useMutation({
    mutationFn: async () => {
      await api.post('/campaigns/abandoned-cart/dispatch', { limit: 20 });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing-automations'] }),
  });

  const { data: configs } = useQuery({
    queryKey: ['automation-configs'],
    queryFn: async () => {
      const res = await api.get<{ id: string; type: string; enabled: boolean; messageTemplate: string; config: Record<string, unknown> }[]>('/campaigns/automations/config');
      return res.success ? res.data : [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ type, payload }: { type: string; payload: { enabled: boolean; messageTemplate: string; config: Record<string, unknown> } }) => {
      await api.put(`/campaigns/automations/config/${type}`, payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automation-configs'] }),
  });

  const recoveryScenarios = automations?.recovery ?? [];
  const abandonedCarts = automations?.abandonedCarts ?? [];
  const center = automations?.center;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Automações"
        description="CRM inteligente, recuperação, carrinho abandonado e recomendações comerciais."
        icon={Bot}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-status-success/10 text-status-success">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ticket Médio</p>
              <p className="text-xl font-semibold">{formatCurrency(kpis?.averageTicket ?? 0)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10 text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">LTV</p>
              <p className="text-xl font-semibold">{formatCurrency(kpis?.ltv ?? 0)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-status-warning/10 text-status-warning">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Retenção</p>
              <p className="text-xl font-semibold">{formatPercent(kpis?.retentionRate ?? 0)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-accent/10 text-accent-foreground">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conversão</p>
              <p className="text-xl font-semibold">{formatPercent(kpis?.campaignConversionRate ?? 0)}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        <Card>
          <Metric icon={Megaphone} label="Ativas" value={center?.active.length ?? 0} />
        </Card>
        <Card>
          <Metric icon={PauseCircle} label="Pausadas" value={center?.paused.length ?? 0} />
        </Card>
        <Card>
          <Metric icon={Send} label="Enviados" value={center?.totals.sent ?? 0} />
        </Card>
        <Card>
          <Metric icon={Users} label="Convertidos" value={center?.totals.converted ?? 0} />
        </Card>
        <Card>
          <Metric icon={DollarSign} label="Receita" value={formatCurrency(center?.totals.revenueGenerated ?? 0)} />
        </Card>
        <Card>
          <Metric icon={AlertTriangle} label="Falhas" value={center?.totals.failures ?? 0} />
        </Card>
        <Card>
          <Metric icon={RefreshCw} label="Opt-outs" value={center?.totals.optOuts ?? 0} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold">Recuperação de clientes</h2>
              <p className="text-sm text-muted-foreground">Campanhas por 30, 60 e 90 dias sem compra.</p>
            </div>
            <StatusBadge status="success">Ativa</StatusBadge>
          </div>

          <div className="space-y-3">
            {recoveryScenarios.map((scenario) => (
              <div key={scenario.days} className="border border-border rounded-lg p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{scenario.days} dias sem compra</p>
                  <p className="text-sm text-muted-foreground">{scenario.audience} clientes elegíveis</p>
                  <p className="text-xs text-muted-foreground mt-2">{scenario.message}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => recoveryMutation.mutate(scenario.days)}
                  disabled={recoveryMutation.isPending || scenario.audience === 0}
                >
                  <Send className="w-4 h-4" />
                  Criar
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold">Carrinho abandonado</h2>
              <p className="text-sm text-muted-foreground">Lembretes de 30 minutos, 2 horas e 24 horas.</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => abandonedCartMutation.mutate()}
              disabled={abandonedCartMutation.isPending || abandonedCarts.length === 0}
            >
              <ShoppingCart className="w-4 h-4" />
              Disparar
            </Button>
          </div>

          {isLoading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : abandonedCarts.length ? (
             <div className="space-y-3">
               {abandonedCarts.slice(0, 5).map((cart, i) => (
                 <div key={i} className="border border-border rounded-lg p-3 flex items-center justify-between gap-4">
                   <div className="min-w-0">
                     <p className="font-medium text-sm truncate">{cart.phone} {cart.displayName && `(${cart.displayName})`}</p>
                     <p className="text-xs text-muted-foreground mt-1">Inativo há {cart.minutesInactive} min</p>
                   </div>
                   <StatusBadge status="warning">Passo: {cart.step}</StatusBadge>
                 </div>
               ))}
             </div>
           ) : (
             <EmptyState icon={Clock} title="Nenhum carrinho pendente" description="Os lembretes aparecem aqui quando houver abandono detectado." />
           )}
        </Card>
      </div>

      <div className="pt-6">
        <h2 className="text-xl font-bold mb-4">Automações P1</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <AutomationConfigCard
            title="Pós-pedido / Avaliação"
            description="Envia mensagem X horas após o pedido ser entregue."
            type="post_order_review"
            configs={configs}
            onSave={saveMutation.mutate}
            defaultTemplate="Olá {nome}, recebemos seu pedido {pedido}! O que achou? Avalie nossa loja!"
            extraConfigUI={(config: Record<string, unknown>, setConfig: (c: Record<string, unknown>) => void) => (
              <div>
                <label className="text-sm font-medium">Aguardar (horas)</label>
                <input
                  type="number"
                  className="w-full mt-1 p-2 border rounded-md text-sm"
                  value={config.delayHours as number ?? 2}
                  onChange={(e) => setConfig({ ...config, delayHours: Number(e.target.value) })}
                />
              </div>
            )}
          />

          <AutomationConfigCard
            title="Cliente Inativo"
            description="Traz de volta clientes que não compram há Y dias."
            type="inactive_customer_winback"
            configs={configs}
            onSave={saveMutation.mutate}
            defaultTemplate="Faz tempo que não te vemos, {nome}! Que tal um pedido com o cupom {cupom}?"
            extraConfigUI={(config: Record<string, unknown>, setConfig: (c: Record<string, unknown>) => void) => (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm font-medium">Dias Inativo</label>
                  <input
                    type="number"
                    className="w-full mt-1 p-2 border rounded-md text-sm"
                    value={config.daysInactive as number ?? 30}
                    onChange={(e) => setConfig({ ...config, daysInactive: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Cupom</label>
                  <input
                    type="text"
                    className="w-full mt-1 p-2 border rounded-md text-sm"
                    value={config.couponCode as string ?? ''}
                    onChange={(e) => setConfig({ ...config, couponCode: e.target.value })}
                  />
                </div>
              </div>
            )}
          />

          <AutomationConfigCard
            title="Aniversário"
            description="Envia mensagem no aniversário do cliente (se houver birthDate)."
            type="birthday_greeting"
            configs={configs}
            onSave={saveMutation.mutate}
            defaultTemplate="Feliz aniversário, {nome}! Aproveite seu dia com {cupom} no nosso cardápio: {link_cardapio}"
            extraConfigUI={(config: Record<string, unknown>, setConfig: (c: Record<string, unknown>) => void) => (
              <div>
                <label className="text-sm font-medium">Cupom</label>
                <input
                  type="text"
                  className="w-full mt-1 p-2 border rounded-md text-sm"
                  value={config.couponCode as string ?? ''}
                  onChange={(e) => setConfig({ ...config, couponCode: e.target.value })}
                />
              </div>
            )}
          />
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Ultimas execucoes</h2>
          <StatusBadge status="info">{center?.totals.delivered ?? 0} entregues</StatusBadge>
        </div>
        <div className="space-y-3">
          {(center?.lastExecutions ?? []).slice(0, 6).map((execution) => (
            <div key={execution.id} className="border border-border rounded-lg p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{execution.name}</p>
                <p className="text-sm text-muted-foreground">
                  {execution.sent} enviados - {execution.converted} conversoes
                </p>
              </div>
              <StatusBadge status={execution.status === 'completed' ? 'success' : execution.status === 'running' ? 'info' : 'neutral'}>
                {execution.status}
              </StatusBadge>
            </div>
          ))}
          {!(center?.lastExecutions ?? []).length && (
            <EmptyState icon={Clock} title="Sem execucoes recentes" description="As automacoes executadas aparecem aqui." />
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Insights inteligentes</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(insights?.insights ?? []).map((insight) => (
            <div key={insight.type} className="border border-border rounded-lg p-4">
              <StatusBadge status={insight.severity === 'success' ? 'success' : insight.severity === 'warning' ? 'warning' : 'info'}>
                {insight.severity === 'success' ? 'Oportunidade' : insight.severity === 'warning' ? 'Atenção' : 'Insight'}
              </StatusBadge>
              <p className="mt-3 text-sm text-foreground">{insight.message}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-lg bg-muted text-muted-foreground">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </div>
    </div>
  );
}
