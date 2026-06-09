import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Clock, Megaphone, RefreshCw, Send, ShoppingCart, Sparkles, Users } from 'lucide-react';
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

  const recoveryScenarios = automations?.recovery ?? [];
  const abandonedCarts = automations?.abandonedCarts ?? [];

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
              {abandonedCarts.slice(0, 5).map((cart) => (
                <div key={cart.sessionId} className="border border-border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{cart.displayName || cart.phone}</p>
                    <p className="text-sm text-muted-foreground">{cart.minutesInactive} min parado</p>
                  </div>
                  <StatusBadge status="warning">{cart.step}</StatusBadge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Clock} title="Nenhum carrinho pendente" description="Os lembretes aparecem aqui quando houver abandono detectado." />
          )}
        </Card>
      </div>

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
