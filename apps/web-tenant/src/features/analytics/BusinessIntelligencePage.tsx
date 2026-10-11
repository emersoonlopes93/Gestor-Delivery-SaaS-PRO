import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BadgeCheck, Bot, DollarSign, Flame, Package, TrendingUp } from 'lucide-react';
import { api } from '../../lib/api-client';
import {
  chartAxisColor,
  chartGridColor,
  chartTooltipContentStyle,
  chartTooltipCursor,
  chartTooltipItemStyle,
  chartTooltipLabelStyle,
} from '../../components/charts/chart-theme';

type BiPayload = {
  dashboard: {
    revenue: { today: number; yesterday: number; week: number; month: number; year: number };
    orders: { quantity: number; averageTicket: number; growthPercentage: number };
    customers: { newCustomers: number; recurringCustomers: number; vipCustomers: number; atRiskCustomers: number };
    operation: {
      averagePreparationTimeMinutes: number;
      averageDeliveryTimeMinutes: number;
      cancelledOrders: number;
      conversionRate: number;
    };
  };
  profitability?: {
    product: Array<{ id: string; name: string; revenue: number; estimatedCost: number; grossProfit: number; marginPercentage: number; quantity: number }>;
    category: Array<{ name: string; revenue: number; profit: number; marginPercentage: number }>;
    channel: Array<{ name: string; revenue: number; profit: number; marginPercentage: number }>;
  };
  abcCurve?: {
    revenue: Array<{ id: string; name: string; revenue: number; classification: 'A' | 'B' | 'C' }>;
  };
  customerIntelligence: {
    ltv: number;
    averageFrequency: number;
    averageTicket: number;
    atRiskCustomers: number;
    estimatedChurn: number;
  };
  heatmap: {
    days: string[];
    hours: number[];
    cells: Array<{ dayOfWeek: number; hour: number; orders: number; revenue: number }>;
  };
  forecast: {
    next7Days: { predictedOrders: number; predictedRevenue: number };
    next30Days: { predictedOrders: number; predictedRevenue: number };
  };
  products?: {
    bestSellers: Array<{ id: string; name: string; quantity: number; revenue: number }>;
    mostProfitable: Array<{ id: string; name: string; grossProfit: number; marginPercentage: number }>;
    lowestMargin: Array<{ id: string; name: string; marginPercentage: number }>;
    growing: Array<{ id: string; name: string; growthPercentage: number }>;
    falling: Array<{ id: string; name: string; growthPercentage: number }>;
  };
  campaigns: {
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
    converted: number;
    revenueGenerated: number;
    conversionRate: number;
  };
  loyalty: {
    loyalCustomers: number;
    pointsIssued: number;
    pointsRedeemed: number;
    cashbackIssued: number;
    cashbackUsed: number;
  };
};

type AiPayload = {
  insights: Array<{ type: string; severity: 'success' | 'info' | 'warning'; message: string; value?: number }>;
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR');

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function BusinessIntelligencePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['business-intelligence-enterprise'],
    queryFn: async () => {
      const res = await api.get<BiPayload>('/analytics/business-intelligence');
      return res.data;
    },
  });

  const canViewCosts = Boolean(data?.profitability);

  const { data: ai } = useQuery({
    queryKey: ['business-intelligence-ai-insights'],
    queryFn: async () => {
      const res = await api.get<AiPayload>('/analytics/ai-insights');
      return res.data;
    },
    enabled: canViewCosts,
  });

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando Business Intelligence...</div>;
  }

  const heatmap = data.heatmap.cells.filter((cell) => cell.orders > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 12);
  const productChart = data.profitability?.product.slice(0, 8).map((item) => ({ name: item.name, lucro: item.grossProfit, receita: item.revenue })) ?? [];
  const abcCurve = data.abcCurve;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Business Intelligence</h1>
          <p className="text-sm text-muted-foreground">Receita, rentabilidade, clientes, campanhas, fidelidade e previsoes.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground">
          <BadgeCheck className="h-4 w-4" />
          Sem LLM externo
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric title="Hoje" value={money.format(data.dashboard.revenue.today)} icon={DollarSign} />
        <Metric title="Semana" value={money.format(data.dashboard.revenue.week)} icon={TrendingUp} />
        <Metric title="Mes" value={money.format(data.dashboard.revenue.month)} icon={DollarSign} />
        <Metric title="Pedidos" value={number.format(data.dashboard.orders.quantity)} icon={Package} />
        <Metric title="Ticket medio" value={money.format(data.dashboard.orders.averageTicket)} icon={BadgeCheck} />
      </div>

      {data.profitability || canViewCosts ? <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        {data.profitability ? <Panel title="Rentabilidade por produto">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productChart}>
                <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke={chartAxisColor} tick={{ fill: chartAxisColor, fontSize: 11 }} interval={0} angle={-20} height={70} />
                <YAxis stroke={chartAxisColor} tick={{ fill: chartAxisColor }} tickFormatter={(v) => money.format(Number(v)).replace('R$', '')} />
                <Tooltip
                  contentStyle={chartTooltipContentStyle}
                  cursor={chartTooltipCursor}
                  itemStyle={chartTooltipItemStyle}
                  labelStyle={chartTooltipLabelStyle}
                  formatter={(v) => money.format(Number(v))}
                />
                <Bar dataKey="receita" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="lucro" fill="var(--status-success)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel> : null}

        {canViewCosts ? <Panel title="IA Comercial Enterprise" icon={Bot}>
          <div className="divide-y divide-border">
            {(ai?.insights ?? []).slice(0, 7).map((insight) => (
              <div key={insight.type} className="py-3">
                <span className={`rounded-md px-2 py-1 text-[10px] font-black uppercase ${insightClass(insight.severity)}`}>
                  {insight.severity}
                </span>
                <p className="mt-2 text-sm text-foreground">{insight.message}</p>
              </div>
            ))}
          </div>
        </Panel> : null}
      </div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Clientes">
          <List rows={[
            ['LTV', money.format(data.customerIntelligence.ltv)],
            ['Frequencia media', data.customerIntelligence.averageFrequency.toFixed(2)],
            ['Ticket medio', money.format(data.customerIntelligence.averageTicket)],
            ['Clientes em risco', number.format(data.customerIntelligence.atRiskCustomers)],
            ['Churn estimado', pct(data.customerIntelligence.estimatedChurn)],
          ]} />
        </Panel>
        <Panel title="Operacao">
          <List rows={[
            ['Preparo medio', `${data.dashboard.operation.averagePreparationTimeMinutes.toFixed(1)} min`],
            ['Entrega media', `${data.dashboard.operation.averageDeliveryTimeMinutes.toFixed(1)} min`],
            ['Cancelados', number.format(data.dashboard.operation.cancelledOrders)],
            ['Conversao campanhas', pct(data.dashboard.operation.conversionRate)],
            ['Crescimento pedidos', pct(data.dashboard.orders.growthPercentage)],
          ]} />
        </Panel>
        <Panel title="Forecast">
          <List rows={[
            ['7 dias pedidos', number.format(data.forecast.next7Days.predictedOrders)],
            ['7 dias receita', money.format(data.forecast.next7Days.predictedRevenue)],
            ['30 dias pedidos', number.format(data.forecast.next30Days.predictedOrders)],
            ['30 dias receita', money.format(data.forecast.next30Days.predictedRevenue)],
          ]} />
        </Panel>
      </div>

      {abcCurve ? <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Curva ABC por receita">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['A', 'B', 'C'] as const).map((klass) => (
              <div key={klass} className="rounded-lg border border-border p-4">
                <p className="text-xs font-black text-muted-foreground">Classe {klass}</p>
                <div className="mt-3 space-y-2">
                  {abcCurve.revenue.filter((item) => item.classification === klass).slice(0, 5).map((item) => (
                    <div key={`${klass}-${item.id}`} className="flex justify-between gap-3 text-sm">
                      <span className="truncate text-foreground">{item.name}</span>
                      <span className="font-bold text-muted-foreground">{money.format(item.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Heatmap de vendas">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {heatmap.map((cell) => (
              <div key={`${cell.dayOfWeek}-${cell.hour}`} className="rounded-lg border border-border p-3" style={{ backgroundColor: heatColor(cell.revenue, heatmap[0]?.revenue ?? 1) }}>
                <p className="text-xs font-black text-foreground">{data.heatmap.days[cell.dayOfWeek]} {cell.hour}h</p>
                <p className="text-sm text-muted-foreground">{cell.orders} pedidos</p>
                <p className="text-sm font-bold text-foreground">{money.format(cell.revenue)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Produtos">
          <List rows={[
            ['Mais vendido', data.products?.bestSellers[0]?.name ?? '-'],
            ...(data.products ? [
              ['Mais lucrativo', data.products.mostProfitable[0]?.name ?? '-'],
              ['Menor margem', data.products.lowestMargin[0]?.name ?? '-'],
              ['Em crescimento', data.products.growing[0]?.name ?? '-'],
              ['Em queda', data.products.falling[0]?.name ?? '-'],
            ] as Array<[string, string]> : []),
          ]} />
        </Panel>
        <Panel title="Campanhas">
          <List rows={[
            ['Enviadas', number.format(data.campaigns.sent)],
            ['Entregues', number.format(data.campaigns.delivered)],
            ['Lidas', number.format(data.campaigns.read)],
            ['Convertidas', number.format(data.campaigns.converted)],
            ['Receita', money.format(data.campaigns.revenueGenerated)],
            ['Conversao', pct(data.campaigns.conversionRate)],
          ]} />
        </Panel>
        <Panel title="Fidelidade">
          <List rows={[
            ['Clientes fidelizados', number.format(data.loyalty.loyalCustomers)],
            ['Pontos emitidos', number.format(data.loyalty.pointsIssued)],
            ['Pontos resgatados', number.format(data.loyalty.pointsRedeemed)],
            ['Cashback emitido', money.format(data.loyalty.cashbackIssued)],
            ['Cashback utilizado', money.format(data.loyalty.cashbackUsed)],
          ]} />
        </Panel>
      </div>
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: string; icon: typeof DollarSign }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-muted-foreground">{title}</p>
          <p className="mt-2 text-xl font-black text-foreground">{value}</p>
        </div>
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon?: typeof Flame; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="p-5 border-b border-border flex items-center gap-2">
        {Icon ? <Icon className="h-5 w-5 text-primary" /> : null}
        <h2 className="text-lg font-black text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function List({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-black text-foreground text-right">{value}</span>
        </div>
      ))}
    </div>
  );
}

function insightClass(severity: 'success' | 'info' | 'warning') {
  if (severity === 'success') return 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300';
  if (severity === 'warning') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300';
  return 'bg-primary/10 text-primary';
}

function heatColor(value: number, max: number) {
  const intensity = Math.max(0.08, Math.min(0.32, value / Math.max(max, 1) * 0.32));
  return `rgba(34, 197, 94, ${intensity})`;
}
