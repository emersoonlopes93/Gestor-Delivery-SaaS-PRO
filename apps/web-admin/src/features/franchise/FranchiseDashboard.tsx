import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import { 
  Building2, 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  ArrowUpRight, 
  Filter,
  Calendar,
  Plus,
  Settings,
  X,
  Store,
  Trash2
} from 'lucide-react';
import type { PaginatedResponse, Tenant } from '@gestor/types';

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

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  const fetchGroups = async () => {
    try {
      const res = await api.get<FranchiseGroup[]>('/admin/franchises');
      setGroups(res.data);
      if (res.data.length > 0 && !selectedGroupId) {
        setSelectedGroupId(res.data[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar grupos:', err);
    }
  };

  const fetchAllTenants = async () => {
    try {
      const res = await api.get<PaginatedResponse<Tenant>>('/admin/tenants');
      setAllTenants(res.data.items || []);
    } catch (err) {
      console.error('Erro ao carregar tenants:', err);
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchAllTenants();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGroups]);

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

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      await api.post('/admin/groups', { name: newGroupName });
      setNewGroupName('');
      setIsCreateModalOpen(false);
      // Recarrega os grupos e seleciona a nova franquia criada
      const res = await api.get<FranchiseGroup[]>('/admin/franchises');
      setGroups(res.data);
      const created = res.data.find(g => g.name.toLowerCase() === newGroupName.toLowerCase().trim());
      if (created) {
        setSelectedGroupId(created.id);
      } else if (res.data.length > 0) {
        setSelectedGroupId(res.data[0].id);
      }
    } catch (err) {
      console.error('Erro ao criar grupo:', err);
      alert('Erro ao criar franquia.');
    }
  };

  const handleAddTenant = async () => {
    if (!selectedGroupId || !selectedTenantId) return;

    try {
      await api.put(`/admin/groups/${selectedGroupId}/tenants`, { tenantId: selectedTenantId });
      setSelectedTenantId('');
      
      // Atualizar dashboard
      const res = await api.get<FranchiseStats>(`/admin/franchises/${selectedGroupId}/dashboard`);
      setStats(res.data);
    } catch (err) {
      console.error('Erro ao adicionar tenant:', err);
      alert('Erro ao vincular loja.');
    }
  };

  const handleRemoveTenant = async (tenantId: string) => {
    if (!window.confirm('Tem certeza que deseja remover esta loja desta franquia?')) return;

    try {
      await api.delete(`/admin/groups/tenants/${tenantId}`);
      
      // Atualizar dashboard
      const res = await api.get<FranchiseStats>(`/admin/franchises/${selectedGroupId}/dashboard`);
      setStats(res.data);
    } catch (err) {
      console.error('Erro ao remover tenant:', err);
      alert('Erro ao desvincular loja.');
    }
  };

  // Filtra tenants que já estão associados a esta ou a outras franquias (simplificado: não associados a esta franquia)
  const availableTenants = allTenants.filter(
    (t) => !stats?.tenants.some((st) => st.id === t.id)
  );

  if (groups.length === 0) {
    return (
      <div className="p-8 text-center min-h-[60vh] flex flex-col justify-center items-center max-w-xl mx-auto space-y-6">
        <div className="w-20 h-20 bg-primary/10 rounded-[32px] flex items-center justify-center text-primary shadow-lg shadow-primary/10">
          <Building2 className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-foreground tracking-tight">Nenhuma franquia cadastrada</h2>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            Crie sua primeira franquia (Grupo de Negócios) para obter visibilidade consolidada de performance e produtos mais vendidos entre múltiplas lojas.
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground font-black rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
          Cadastrar Primeira Franquia
        </button>

        {/* Modal de Criação (Estado Vazio) */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
            <div className="bg-card border border-border w-full max-w-md rounded-[32px] shadow-2xl p-8 relative animate-in fade-in zoom-in-95 duration-200 text-left">
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="absolute top-6 right-6 p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-2xl font-black text-foreground mb-1">Nova Franquia</h3>
              <p className="text-sm text-muted-foreground mb-6">Insira o nome para identificar a rede multi-unidades.</p>

              <form onSubmit={handleCreateGroup} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Nome do Grupo / Franquia</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Grupo Pastelaria Gourmet"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-4 py-3 bg-card border border-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  />
                </div>
                
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-5 py-3 rounded-2xl border border-border font-bold text-sm text-muted-foreground hover:bg-muted transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/25"
                  >
                    Salvar Franquia
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
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

        <div className="flex flex-wrap items-center gap-3">
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
          
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl shadow-sm text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Franquia
          </button>

          <button 
            onClick={() => setIsManageModalOpen(true)}
            className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl shadow-sm text-sm font-bold hover:bg-muted transition-colors text-foreground"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
            Gerenciar Lojas
          </button>

          <button className="flex items-center gap-2 bg-card border border-border px-4 py-2.5 rounded-xl shadow-sm text-sm font-bold hover:bg-muted transition-colors text-foreground">
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
                {stats.tenants.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma loja vinculada a esta franquia ainda.</p>
                ) : stats.tenants.map(t => (
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
                          style={{ width: `${stats.totalSales > 0 ? (t.totalSales / stats.totalSales) * 100 : 0}%` }}
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
                {stats.topProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nenhum dado de produto disponível para o período.</p>
                ) : stats.topProducts.map((p, idx) => (
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

      {/* Modal de Criação */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-md rounded-[32px] shadow-2xl p-8 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-2xl font-black text-foreground mb-1 text-left">Nova Franquia</h3>
            <p className="text-sm text-muted-foreground mb-6 text-left">Insira o nome para identificar a rede multi-unidades.</p>

            <form onSubmit={handleCreateGroup} className="space-y-6 text-left">
              <div>
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Nome do Grupo / Franquia</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Grupo Pastelaria Gourmet"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-3 bg-card border border-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-ring text-sm text-foreground"
                />
              </div>
              
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-5 py-3 rounded-2xl border border-border font-bold text-sm text-muted-foreground hover:bg-muted transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/25"
                >
                  Salvar Franquia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Gerenciamento de Unidades (Vincular/Desvincular Lojas) */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="bg-card border border-border w-full max-w-2xl rounded-[32px] shadow-2xl p-8 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsManageModalOpen(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-2xl font-black text-foreground mb-1 text-left">Vincular Lojas à Rede</h3>
            <p className="text-sm text-muted-foreground mb-6 text-left">
              Gerencie quais lojas pertencem à franquia selecionada: <span className="font-bold text-primary">{groups.find(g => g.id === selectedGroupId)?.name}</span>
            </p>

            <div className="space-y-6 text-left">
              {/* Adicionar nova loja */}
              <div className="bg-muted/30 border border-border p-5 rounded-2xl space-y-3">
                <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest">Adicionar Loja à Rede</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    className="flex-1 px-4 py-3 bg-card border border-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-ring text-sm text-foreground"
                  >
                    <option value="">Selecione uma loja para adicionar...</option>
                    {availableTenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddTenant}
                    disabled={!selectedTenantId}
                    className="px-6 py-3 bg-primary text-primary-foreground font-bold text-sm rounded-2xl hover:bg-primary/95 transition-all shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    Vincular Loja
                  </button>
                </div>
              </div>

              {/* Lista de lojas associadas */}
              <div>
                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">Lojas Atuais na Franquia</h4>
                <div className="max-h-60 overflow-y-auto border border-border rounded-2xl divide-y divide-border bg-card">
                  {!stats?.tenants || stats.tenants.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-6 text-center">Nenhuma loja associada a esta franquia.</p>
                  ) : stats.tenants.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <Store className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-bold text-foreground text-sm">{t.name}</p>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase font-mono">{t.slug}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveTenant(t.id)}
                        className="p-2.5 rounded-xl border border-destructive/20 hover:border-destructive text-destructive hover:bg-destructive/10 transition-all"
                        title="Desvincular loja"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-8 pt-2">
              <button
                onClick={() => setIsManageModalOpen(false)}
                className="px-6 py-3 rounded-2xl bg-muted hover:bg-muted/80 border border-border font-bold text-sm text-foreground transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
