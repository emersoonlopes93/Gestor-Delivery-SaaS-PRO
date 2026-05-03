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

export function FranchiseDashboard() {
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [stats, setStats] = useState<FranchiseStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const res = await api.get<any[]>('/admin/franchises');
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
        <Building2 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-slate-400">Nenhuma franquia cadastrada</h2>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Dashboard de Franquias</h1>
          <p className="text-slate-500 mt-1">Visão consolidada de performance multi-unidades</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded-xl shadow-sm">
            <Filter className="w-4 h-4 text-slate-400" />
            <select 
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="text-sm font-bold bg-transparent border-none focus:ring-0 outline-none pr-8"
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm text-sm font-bold hover:bg-slate-50 transition-colors">
            <Calendar className="w-4 h-4 text-slate-400" />
            Últimos 30 dias
          </button>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-3xl" />)}
        </div>
      ) : stats && (
        <>
          {/* Main Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Vendas Totais (Rede)</p>
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
                  {stats.totalSales.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </h3>
                <div className="flex items-center gap-1 mt-2 text-emerald-500 font-bold text-xs">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>+12.5% em relação ao período anterior</span>
                </div>
              </div>
              <TrendingUp className="absolute -right-4 -bottom-4 w-24 h-24 text-slate-50 group-hover:text-indigo-50 transition-colors" />
            </div>

            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total de Pedidos</p>
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
                  {stats.totalOrders}
                </h3>
                <div className="flex items-center gap-1 mt-2 text-emerald-500 font-bold text-xs">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>+8.2% novos clientes</span>
                </div>
              </div>
              <ShoppingBag className="absolute -right-4 -bottom-4 w-24 h-24 text-slate-50 group-hover:text-indigo-50 transition-colors" />
            </div>

            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Ticket Médio (Rede)</p>
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
                  {(stats.totalSales / (stats.totalOrders || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </h3>
                <div className="flex items-center gap-1 mt-2 text-slate-400 font-bold text-xs">
                  <span>Média baseada em {stats.tenants.length} unidades</span>
                </div>
              </div>
              <Users className="absolute -right-4 -bottom-4 w-24 h-24 text-slate-50 group-hover:text-indigo-50 transition-colors" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Performance by Unit */}
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8">
              <h4 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-500" />
                Performance por Unidade
              </h4>
              <div className="space-y-4">
                {stats.tenants.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-colors">
                    <div>
                      <p className="font-black text-slate-800">{t.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{t.totalOrders} pedidos</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-indigo-600">
                        {t.totalSales.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <div className="w-32 h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500" 
                          style={{ width: `${(t.totalSales / stats.totalSales) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-8">
              <h4 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-500" />
                Top 10 Produtos da Rede
              </h4>
              <div className="space-y-4">
                {stats.topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 border-b border-slate-50 last:border-none">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-slate-300 w-4">#{idx + 1}</span>
                      <p className="font-bold text-slate-700">{p.name}</p>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Quantidade</p>
                        <p className="font-black text-slate-800">{p.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Receita</p>
                        <p className="font-black text-slate-800">
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
