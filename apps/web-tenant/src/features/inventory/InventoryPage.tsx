import { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { IngredientDTO, CreateIngredientDTO, UnitType } from '@gestor/types';
import { IngredientModal } from './IngredientModal';
import { MovementsTable } from './SubComponents/MovementsTable';
import { LossesPage } from './SubComponents/LossesPage';
import { InventoryCountPage } from './SubComponents/InventoryCountPage';
import { Package, RefreshCcw, TrendingDown, DollarSign, Search, Filter, AlertTriangle } from 'lucide-react';

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
      {/* Header Centralizado */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-2">
            <Package className="text-primary-600" /> Hub de Suprimentos
          </h1>
          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1">Gestão inteligente de insumos e movimentações.</p>
        </div>
        <button
          onClick={() => {
            setEditingIngredient(null);
            setIsModalOpen(true);
          }}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-primary-500/20"
        >
          <span className="text-lg">+</span> Novo Insumo
        </button>
      </div>

      {/* KPI Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-premium p-4 flex flex-col justify-between border-l-4 border-l-primary-500">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Valor em Estoque</span>
            <DollarSign size={16} className="text-gray-300" />
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(summary?.totalValue || 0)}
          </div>
        </div>

        <div className={`card-premium p-4 flex flex-col justify-between border-l-4 ${(summary?.lowStockItems || 0) > 0 ? 'border-l-amber-500' : 'border-l-green-500'}`}>
          <div className="flex items-start justify-between mb-2">
            <span className="text-sm font-medium text-gray-500">Insumos Críticos</span>
            <AlertTriangle size={16} className={(summary?.lowStockItems || 0) > 0 ? 'text-amber-500' : 'text-gray-300'} />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-gray-100">{summary?.lowStockItems || 0}</div>
        </div>

        <div className="card-premium p-4 flex flex-col justify-between border-l-4 border-l-red-500">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fora de Estoque</span>
            <TrendingDown size={16} className="text-red-500" />
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{summary?.outOfStockItems || 0} itens</div>
        </div>

        <div className="card-premium p-4 flex flex-col justify-between border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Ativos</span>
            <RefreshCcw size={16} className="text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{summary?.totalActiveItems || 0} insumos</div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl w-fit">
        {[
          { id: 'ingredients', label: 'Insumos', icon: Package },
          { id: 'movements', label: 'Movimentações', icon: RefreshCcw },
          { id: 'losses', label: 'Perdas', icon: TrendingDown },
          { id: 'counts', label: 'Inventário', icon: Filter },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as InventoryTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === tab.id ? 'bg-white dark:bg-gray-900 text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <tab.icon size={14} />
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="card-premium overflow-hidden border-none shadow-premium bg-white/60 dark:bg-gray-900/60 backdrop-blur-md">
        {activeTab === 'ingredients' && (
          <div>
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
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
                          >
                            <Search size={16} />
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
