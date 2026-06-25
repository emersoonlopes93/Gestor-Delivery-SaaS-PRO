import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import { CreditCard, TrendingUp, Plus, Edit2, CheckCircle2, XCircle, Save, X } from 'lucide-react';
import { PlanDTO } from '@gestor/types';

const AVAILABLE_FEATURES = [
  { id: 'max_orders', name: 'Pedidos Ilimitados', type: 'boolean' },
  { id: 'multi_unit', name: 'Multi-unidades', type: 'boolean' },
  { id: 'advanced_crm', name: 'CRM Avançado (RFM)', type: 'boolean' },
  { id: 'custom_domain', name: 'Domínio Próprio', type: 'boolean' },
  { id: 'white_label', name: 'White Label', type: 'boolean' },
  { id: 'whatsapp_notifications', name: 'Notificações WhatsApp', type: 'boolean' },
  { id: 'inventory_management', name: 'Gestão de Estoque', type: 'boolean' },
  { id: 'kds_access', name: 'Sistema de Cozinha (KDS)', type: 'boolean' },
  { id: 'pos_access', name: 'PDV / Frente de Caixa', type: 'boolean' },
  { id: 'driver_pwa', name: 'PWA para Entregadores', type: 'boolean' },
  { id: 'digital_menu', name: 'Cardápio Digital (Vendas Online)', type: 'boolean' },
  { id: 'loyalty_program', name: 'Fidelidade e Cashback', type: 'boolean' },
  { id: 'advanced_reports', name: 'Relatórios de Custos/Margens', type: 'boolean' },
];

export function BillingPage() {
  const [plans, setPlans] = useState<PlanDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Partial<PlanDTO> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.get<PlanDTO[] | { items: PlanDTO[] }>('/admin/billing/plans');
      const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setPlans(data);
    } catch (err) {
      console.error('Erro ao carregar planos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleOpenModal = (plan: Partial<PlanDTO> | null = null) => {
    setSelectedPlan(plan || {
      name: '',
      slug: '',
      price: 0,
      billingCycle: 'monthly',
      isActive: true,
      features: AVAILABLE_FEATURES.reduce((acc, feat) => ({ ...acc, [feat.id]: false }), {}),
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    try {
      setSaving(true);
      if (selectedPlan.id) {
        await api.put(`/admin/billing/plans/${selectedPlan.id}`, selectedPlan);
      } else {
        await api.post('/admin/billing/plans', selectedPlan);
      }
      setIsModalOpen(false);
      fetchPlans();
    } catch (err: unknown) {
      console.error('Erro ao salvar plano:', err);
      const message = err instanceof Error ? err.message : 'Verifique se o slug é único.';
      alert(`Erro ao salvar o plano: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFeature = (featureId: string) => {
    if (!selectedPlan) return;
    const currentFeatures = { ...(selectedPlan.features || {}) } as Record<string, boolean | string | number>;
    currentFeatures[featureId] = !currentFeatures[featureId];
    setSelectedPlan({ ...selectedPlan, features: currentFeatures });
  };

  if (loading && plans.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Planos & Billing</h1>
          <p className="text-muted-foreground mt-1">Gerencie produtos e faturamento da plataforma SaaS</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-primary hover:opacity-90 text-primary-foreground px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Novo Plano
        </button>
      </div>

      {/* Plans List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
        {plans.length === 0 ? (
          <div className="col-span-full text-center py-20 bg-card rounded-3xl border-2 border-dashed border-border">
            <CreditCard className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium text-lg">Nenhum plano disponível</p>
            <button onClick={() => handleOpenModal()} className="mt-4 text-primary font-bold hover:underline">
              Crie o primeiro plano agora
            </button>
          </div>
        ) : (
          plans.map((plan) => (
            <div
              key={plan.id}
              className={`group bg-card rounded-3xl p-6 border-2 transition-all relative overflow-hidden ${
                plan.isActive ? 'border-border hover:border-primary/50 hover:shadow-xl' : 'border-border opacity-75 grayscale-[0.5]'
              }`}
            >
              {!plan.isActive && (
                <div className="absolute top-4 right-4 bg-muted text-muted-foreground text-[10px] font-black uppercase px-2 py-1 rounded-md">
                  Inativo
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-xl font-black text-foreground mb-1">{plan.name}</h3>
                <code className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono">
                  {plan.slug}
                </code>
              </div>

              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-black text-foreground tracking-tighter">
                  {Number(plan.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-sm font-bold text-muted-foreground lowercase">
                  /{plan.billingCycle === 'monthly' ? 'mês' : 'ano'}
                </span>
              </div>

              <div className="space-y-3 mb-8 min-h-[160px]">
                <p className="text-[11px] font-black text-muted-foreground/50 uppercase tracking-widest">Recursos Inclusos</p>
                {AVAILABLE_FEATURES.map((feat) => (
                  <div key={feat.id} className="flex items-center gap-2 text-sm">
                    {plan.features?.[feat.id] ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground/20 flex-shrink-0" />
                    )}
                    <span className={plan.features?.[feat.id] ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                      {feat.name}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenModal(plan)}
                  className="flex-1 flex items-center justify-center gap-2 bg-muted hover:bg-primary/5 text-muted-foreground hover:text-primary py-3 rounded-2xl font-bold transition-colors text-sm border border-border"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Stats Section Placeholder */}
      <div className="bg-card rounded-[32px] p-8 text-foreground relative overflow-hidden border border-border">
        <div className="relative z-10">
          <h2 className="text-2xl font-black mb-2 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Performance de Assinaturas
          </h2>
          <p className="text-muted-foreground text-sm mb-8">Visão geral do faturamento recorrente da plataforma</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="bg-muted p-6 rounded-2xl border border-border">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Total de Tenants</p>
              <p className="text-3xl font-black text-foreground">---</p>
            </div>
            <div className="bg-muted p-6 rounded-2xl border border-border">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">MRR Estimado</p>
              <p className="text-3xl font-black text-foreground">R$ 0,00</p>
            </div>
            <div className="bg-muted p-6 rounded-2xl border border-border">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1">Churn Rate</p>
              <p className="text-3xl font-black text-foreground">0%</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[120px] rounded-full -mr-20 -mt-20"></div>
      </div>

      {/* Modal */}
      {isModalOpen && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-card rounded-[32px] shadow-2xl w-full max-w-xl relative z-10 overflow-hidden animate-in fade-in zoom-in duration-200 border border-border">
            <div className="p-8 border-b border-border flex items-center justify-between">
              <h2 className="text-2xl font-black text-foreground">
                {selectedPlan.id ? 'Editar Plano' : 'Criar Novo Plano'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground p-2 hover:bg-muted rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-8 flex flex-col gap-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black text-muted-foreground uppercase">Nome do Plano</label>
                  <input
                    type="text"
                    required
                    value={selectedPlan.name}
                    onChange={(e) => setSelectedPlan({ ...selectedPlan, name: e.target.value })}
                    className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                    placeholder="Ex: Diamond"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black text-muted-foreground uppercase">Slug único</label>
                  <input
                    type="text"
                    required
                    disabled={!!selectedPlan.id}
                    value={selectedPlan.slug}
                    onChange={(e) => setSelectedPlan({ ...selectedPlan, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground disabled:opacity-50 placeholder:text-muted-foreground"
                    placeholder="ex-diamond-plan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black text-muted-foreground uppercase">Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={selectedPlan.price}
                    onChange={(e) => setSelectedPlan({ ...selectedPlan, price: parseFloat(e.target.value) })}
                    className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-black text-muted-foreground uppercase">Ciclo</label>
                  <select
                    value={selectedPlan.billingCycle}
                    onChange={(e) => setSelectedPlan({ ...selectedPlan, billingCycle: e.target.value as 'monthly' | 'yearly' })}
                    className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  >
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-border">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Funcionalidades Inclusas</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {AVAILABLE_FEATURES.map((feat) => (
                    <label 
                      key={feat.id} 
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedPlan.features?.[feat.id] 
                          ? 'border-primary/30 bg-primary/5' 
                          : 'border-border bg-muted/30 hover:bg-muted/50'
                      }`}
                    >
                      <span className={`text-sm font-bold ${selectedPlan.features?.[feat.id] ? 'text-primary' : 'text-muted-foreground'}`}>
                        {feat.name}
                      </span>
                      <input
                        type="checkbox"
                        checked={!!selectedPlan.features?.[feat.id]}
                        onChange={() => handleToggleFeature(feat.id)}
                        className="w-5 h-5 rounded-md border-border text-primary focus:ring-primary bg-card"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-border">
                 <input
                  id="isActive"
                  type="checkbox"
                  checked={!!selectedPlan.isActive}
                  onChange={(e) => setSelectedPlan({ ...selectedPlan, isActive: e.target.checked })}
                  className="w-5 h-5 rounded-md border-border text-primary focus:ring-primary bg-card"
                />
                <label htmlFor="isActive" className="text-sm font-bold text-foreground">Este plano está ativo e visível para novos clientes</label>
              </div>

              <div className="flex gap-4 pt-8">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-4 rounded-2xl font-bold bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-[2] py-4 rounded-2xl font-black bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground"></div>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Salvar Plano
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
