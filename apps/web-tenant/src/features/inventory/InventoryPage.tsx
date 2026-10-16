import { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { IngredientDTO, CreateIngredientDTO, UnitType } from '@gestor/types';
import { IngredientModal } from './IngredientModal';
import { MovementsTable } from './SubComponents/MovementsTable';
import { LossesPage } from './SubComponents/LossesPage';
import { InventoryCountPage } from './SubComponents/InventoryCountPage';
import { Package, RefreshCcw, TrendingDown, DollarSign, Search, Filter, AlertTriangle } from 'lucide-react';
import { ContextualNavigation } from '../navigation/NavigationHub';
import { PageHeader } from '../../components/ui/PageHeader';

type InventoryTab = 'ingredients' | 'movements' | 'losses' | 'counts';

interface InventorySummary {
  totalValue: number;
  lowStockItems: number;
  outOfStockItems: number;
  totalActiveItems: number;
}

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>('ingredients');
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<IngredientDTO | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [ingRes, summaryRes] = await Promise.all([
        api.get<IngredientDTO[]>('/inventory/ingredients'),
        api.get<InventorySummary>('/inventory/ingredients/summary'),
      ]);
      if (ingRes.success) setIngredients(ingRes.data);
      if (summaryRes.success) setSummary(summaryRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const unitLabels: Record<UnitType, string> = {
    [UnitType.UN]: 'Unidade',
    [UnitType.G]: 'Grama (g)',
    [UnitType.KG]: 'Quilograma (kg)',
    [UnitType.ML]: 'Mililitro (ml)',
    [UnitType.L]: 'Litro (l)',
  };

  const handleSave = async (data: CreateIngredientDTO) => {
    try {
      if (editingIngredient) {
        await api.put(`/inventory/ingredients/${editingIngredient.id}`, data);
      } else {
        await api.post('/inventory/ingredients', data);
      }
      loadAll();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Erro ao salvar:', error);
      throw error;
    }
  };

  const filteredIngredients = ingredients.filter(ing => 
    ing.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ing.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto text-left space-y-6">
      <PageHeader
        className="mb-6"
        title="Estoque"
        description="Gestão inteligente de insumos e movimentações."
        icon={Package}
        action={(
          <button
          onClick={() => {
            setEditingIngredient(null);
            setIsModalOpen(true);
          }}
          className="hidden items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md shadow-primary-500/20 transition-all hover:bg-primary-700 md:flex"
        >
          <span className="text-lg">+</span> Novo Insumo
          </button>
        )}
      />

      <button
        type="button"
        onClick={() => {
          setEditingIngredient(null);
          setIsModalOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md shadow-primary-500/20 transition-all hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:hidden"
      >
        <span className="text-lg" aria-hidden>+</span> Novo Insumo
      </button>

      <ContextualNavigation itemIds={['management.purchases', 'management.suppliers']} />

      <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">
        Fluxo operacional: compre e receba insumos, acompanhe movimentações, registre perdas e confirme na contagem.
      </p>

      <section aria-label="Resumo atual do estoque" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <div className="flex items-center gap-3 p-4">
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><DollarSign size={16} aria-hidden /></span>
            <div><p className="text-xs font-medium text-muted-foreground">Valor em estoque</p><p className="mt-0.5 text-lg font-semibold text-foreground">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(summary?.totalValue || 0)}</p></div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="rounded-lg bg-status-warning/10 p-2 text-status-warning"><AlertTriangle size={16} aria-hidden /></span>
            <div><p className="text-xs font-medium text-muted-foreground">Insumos críticos</p><p className="mt-0.5 text-lg font-semibold text-foreground">{summary?.lowStockItems || 0}</p></div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="rounded-lg bg-destructive/10 p-2 text-destructive"><TrendingDown size={16} aria-hidden /></span>
            <div><p className="text-xs font-medium text-muted-foreground">Fora de estoque</p><p className="mt-0.5 text-lg font-semibold text-foreground">{summary?.outOfStockItems || 0} itens</p></div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="rounded-lg bg-muted p-2 text-muted-foreground"><RefreshCcw size={16} aria-hidden /></span>
            <div><p className="text-xs font-medium text-muted-foreground">Insumos ativos</p><p className="mt-0.5 text-lg font-semibold text-foreground">{summary?.totalActiveItems || 0}</p></div>
          </div>
        </div>
      </section>

      {/* Tabs Navigation */}
      <div role="tablist" aria-label="Áreas operacionais do estoque" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
        {[
          { id: 'ingredients', label: 'Insumos', icon: Package },
          { id: 'movements', label: 'Movimentações', icon: RefreshCcw },
          { id: 'losses', label: 'Perdas', icon: TrendingDown },
          { id: 'counts', label: 'Inventário', icon: Filter },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as InventoryTab)}
            role="tab"
            aria-selected={activeTab === tab.id}
            id={`inventory-tab-${tab.id}`}
            aria-controls={`inventory-panel-${tab.id}`}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeTab === tab.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            <tab.icon size={14} aria-hidden />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div id={`inventory-panel-${activeTab}`} role="tabpanel" aria-labelledby={`inventory-tab-${activeTab}`} className="overflow-hidden rounded-xl border border-border bg-card">
        {activeTab === 'ingredients' && (
          <div>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <label className="sr-only" htmlFor="inventory-ingredient-search">Buscar insumos</label>
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
                <input
                  id="inventory-ingredient-search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-premium pl-10 h-10"
                  placeholder="Buscar por nome ou SKU..."
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Insumo</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Estoque</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Custo Unit.</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredIngredients.map((ing) => {
                    const isLow = ing.minStock && Number(ing.currentStock) <= Number(ing.minStock);
                    const isOut = Number(ing.currentStock) <= 0;
                    
                    return (
                      <tr key={ing.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900 dark:text-gray-100">{ing.name}</div>
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5">{ing.sku || 'SEM SKU'} • {unitLabels[ing.unit]}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className={`text-sm font-black ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-700 dark:text-gray-300'}`}>
                            {ing.currentStock} <span className="text-[10px] font-bold text-gray-400">{ing.unit}</span>
                          </div>
                          {ing.minStock && (
                            <div className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Mín: {ing.minStock}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-gray-600 dark:text-gray-400">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ing.currentCost)}
                        </td>
                        <td className="px-6 py-4">
                          {isOut ? (
                            <span className="px-2 py-1 rounded-lg bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest">Esgotado</span>
                          ) : isLow ? (
                            <span className="px-2 py-1 rounded-lg bg-amber-50 text-amber-600 text-[9px] font-black uppercase tracking-widest">Crítico</span>
                          ) : (
                            <span className="px-2 py-1 rounded-lg bg-green-50 text-green-600 text-[9px] font-black uppercase tracking-widest">OK</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              setEditingIngredient(ing);
                              setIsModalOpen(true);
                            }}
                            className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                            aria-label={`Editar insumo ${ing.name}`}
                          >
                            <Search size={16} aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'movements' && <MovementsTable />}
        
        {activeTab === 'losses' && <LossesPage />}
        
        {activeTab === 'counts' && <InventoryCountPage />}
      </div>

      <IngredientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        editingIngredient={editingIngredient}
      />
    </div>
  );
}
