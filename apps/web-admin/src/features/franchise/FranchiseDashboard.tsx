import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import { 
  Building2, 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  ArrowUpRight, 
  Filter,
  Calendar
} from 'lucide-react';

interface FranchiseStats {
  totalSales: number;
  totalOrders: number;
  tenants: Array<{
    id: string;
    name: string;
    slug: string;
    totalSales: number;
    totalOrders: number;
  }>;
  topProducts: Array<{
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

interface FranchiseGroup {
  id: string;
  name: string;
}

export function FranchiseDashboard() {
  const [groups, setGroups] = useState<FranchiseGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [stats, setStats] = useState<FranchiseStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const res = await api.get<FranchiseGroup[]>('/admin/franchises');
        setGroups(res.data);
        if (res.data.length > 0) {
          setSelectedGroupId(res.data[0].id);
        }
      } catch (err) {
        console.error('Erro ao carregar grupos:', err);
      }
    };
    fetchGroups();
  }, []);

  useEffect(() => {
    if (!selectedGroupId) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const res = await api.get<FranchiseStats>(`/admin/franchises/${selectedGroupId}/dashboard`);
        setStats(res.data);
      } catch (err) {
        console.error('Erro ao carregar estatísticas:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [selectedGroupId]);

  if (groups.length === 0) {
    return (
      <div className="p-8 text-center">
        <Building2 className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-muted-foreground">Nenhuma franquia cadastrada</h2>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Dashboard de Franquias</h1>
          <p className="text-muted-foreground mt-1">Visão consolidada de performance multi-unidades</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card border border-border p-2 rounded-xl shadow-sm">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select 
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="text-sm font-bold bg-transparent border-none focus:ring-0 outline-none pr-8 text-foreground"
            >
              {groups.map(g => (
                <option key={g.id} value={g.id} className="bg-card text-foreground">{g.name}</option>
              ))}
            </select>
          </div>
          <button className="flex items-center gap-2 bg-card border border-border px-4 py-2 rounded-xl shadow-sm text-sm font-bold hover:bg-muted transition-colors text-foreground">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            Últimos 30 dias
          </button>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-muted rounded-3xl" />)}
        </div>
      ) : stats && (
        <>
          {/* Main Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card p-6 rounded-[32px] border border-border shadow-sm relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Vendas Totais (Rede)</p>
                <h3 className="text-4xl font-black text-foreground tracking-tighter">
                  {stats.totalSales.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </h3>
                <div className="flex items-center gap-1 mt-2 text-emerald-500 font-bold text-xs">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>+12.5% em relação ao período anterior</span>
                </div>
              </div>
              <TrendingUp className="absolute -right-4 -bottom-4 w-24 h-24 text-muted/20 group-hover:text-primary/10 transition-colors" />
            </div>

            <div className="bg-card p-6 rounded-[32px] border border-border shadow-sm relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Total de Pedidos</p>
                <h3 className="text-4xl font-black text-foreground tracking-tighter">
                  {stats.totalOrders}
                </h3>
                <div className="flex items-center gap-1 mt-2 text-emerald-500 font-bold text-xs">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>+8.2% novos clientes</span>
                </div>
              </div>
              <ShoppingBag className="absolute -right-4 -bottom-4 w-24 h-24 text-muted/20 group-hover:text-primary/10 transition-colors" />
            </div>

            <div className="bg-card p-6 rounded-[32px] border border-border shadow-sm relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-1">Ticket Médio (Rede)</p>
                <h3 className="text-4xl font-black text-foreground tracking-tighter">
                  {(stats.totalSales / (stats.totalOrders || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </h3>
                <div className="flex items-center gap-1 mt-2 text-muted-foreground font-bold text-xs">
                  <span>Média baseada em {stats.tenants.length} unidades</span>
                </div>
              </div>
              <Users className="absolute -right-4 -bottom-4 w-24 h-24 text-muted/20 group-hover:text-primary/10 transition-colors" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Performance by Unit */}
            <div className="bg-card rounded-[32px] border border-border shadow-sm p-8">
              <h4 className="text-xl font-black text-foreground mb-6 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Performance por Unidade
              </h4>
              <div className="space-y-4">
                {stats.tenants.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border group hover:border-primary/30 transition-colors">
                    <div>
                      <p className="font-black text-foreground">{t.name}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">{t.totalOrders} pedidos</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-primary">
                        {t.totalSales.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <div className="w-32 h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${(t.totalSales / stats.totalSales) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-card rounded-[32px] border border-border shadow-sm p-8">
              <h4 className="text-xl font-black text-foreground mb-6 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                Top 10 Produtos da Rede
              </h4>
              <div className="space-y-4">
                {stats.topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 border-b border-border last:border-none">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-muted-foreground w-4">#{idx + 1}</span>
                      <p className="font-bold text-foreground/80">{p.name}</p>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Quantidade</p>
                        <p className="font-black text-foreground">{p.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Receita</p>
                        <p className="font-black text-foreground">
                          {p.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
