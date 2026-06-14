import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
  TrendingUp, Package, Clock, DollarSign, 
  ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { DashboardStatsDTO } from '@gestor/types';

/**
 * Filter intervals for the reports
 */
const INTERVALS = [
  { label: 'Hoje', value: 'today' },
  { label: '7 Dias', value: '7d' },
  { label: '30 Dias', value: '30d' },
  { label: 'Este Mês', value: 'month' },
];

export function ReportsPage() {
  const [interval, setInterval] = useState('30d');

  // Calculate dates based on interval
  const getDates = () => {
    const end = new Date();
    const start = new Date();
    if (interval === 'today') start.setHours(0, 0, 0, 0);
    else if (interval === '7d') start.setDate(start.getDate() - 7);
    else if (interval === '30d') start.setDate(start.getDate() - 30);
    else if (interval === 'month') start.setDate(1);
    
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    };
  };

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['analytics-dashboard', interval],
    queryFn: async () => {
      const dates = getDates();
      const res = await api.get<DashboardStatsDTO>(`/analytics/dashboard?startDate=${dates.startDate}&endDate=${dates.endDate}`);
      if (res.success) return res.data;
      throw new Error('Erro ao carregar dados');
    }
  });

  if (isLoading) return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
    </div>
  );

  if (error || !stats) return (
    <div className="p-6 text-center text-red-600 font-medium">
      Erro ao carregar relatórios. Por favor, tente novamente.
    </div>
  );

  const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  // Prepare data for charts
  const channelData = Object.entries(stats.commercial.revenueByChannel).map(([name, value]) => ({ name, value }));

  return (
    <div className="p-6 space-y-8 bg-background min-h-screen">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios Gerenciais</h1>
          <p className="text-muted-foreground">Inteligência e performance para o seu negócio.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-card p-1 rounded-lg border border-border shadow-sm">
          {INTERVALS.map((int) => (
            <button
              key={int.value}
              onClick={() => setInterval(int.value)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                interval === int.value 
                  ? 'bg-primary text-primary-foreground shadow-sm' 
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {int.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Faturamento Total" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.commercial.totalRevenue)}
          icon={<DollarSign className="text-primary-600" />}
          trend="+12%" 
          trendUp={true}
        />
        <MetricCard 
          title="Total de Pedidos" 
          value={stats.commercial.totalOrders.toString()}
          icon={<Package className="text-green-600" />}
          trend="+5.4%" 
          trendUp={true}
        />
        <MetricCard 
          title="Ticket Médio" 
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.commercial.averageTicket)}
          icon={<TrendingUp className="text-amber-600" />}
          trend="-2.1%" 
          trendUp={false}
        />
        <MetricCard 
          title="Cancelamentos" 
          value={`${stats.operational.cancellationRate.toFixed(1)}%`}
          icon={<ArrowDownRight className="text-red-600" />}
          trend="-0.5%" 
          trendUp={true}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Commercial Trend */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <DollarSign size={20} className="text-primary-600" /> Vendas por Canal
          </h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(Number(percent || 0) * 100).toFixed(0)}%`}
                >
                  {channelData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Operational Efficiency */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
            <Clock size={20} className="text-amber-600" /> Eficiência Operacional
          </h2>
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio de Preparo</p>
                <p className="text-xl font-bold text-foreground">{stats.operational.averagePreparationTimeMinutes.toFixed(1)} min</p>
              </div>
              <Clock className="text-blue-500" />
            </div>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio de Entrega</p>
                <p className="text-xl font-bold text-foreground">{stats.operational.averageDeliveryTimeMinutes.toFixed(1)} min</p>
              </div>
              <TrendingUp className="text-orange-500" />
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <h2 className="text-lg font-bold mb-6">Top 5 Produtos</h2>
          <div className="space-y-4">
            {stats.commercial.topProducts.map((product, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 flex items-center justify-center bg-muted text-muted-foreground text-xs font-bold rounded-full">{idx + 1}</span>
                  <span className="font-medium text-foreground">{product.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-bold text-foreground">{product.quantity} un</p>
                  <p className="text-xs text-muted-foreground">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Peak Hours */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <h2 className="text-lg font-bold mb-6">Horários de Pico</h2>
          <div className="h-[250px] w-full">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.operational.peakHours}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} />
                <YAxis />
                <Tooltip formatter={(value) => [`${value} pedidos`, 'Volume']} />
                <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend: string;
  trendUp: boolean;
}

function MetricCard({ title, value, icon, trend, trendUp }: MetricCardProps) {
  return (
    <div className="bg-card p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-muted rounded-lg">{icon}</div>
        <div className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${
          trendUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {trend}
        </div>
      </div>
      <p className="text-xs text-muted-foreground uppercase font-black tracking-wider mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-foreground">{value}</h3>
    </div>
  );
}
