import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { IngredientDTO, CreateIngredientDTO, UnitType } from '@gestor/types';
import { IngredientModal } from './IngredientModal';

export function InventoryPage() {
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<IngredientDTO | null>(null);

  useEffect(() => {
    loadIngredients();
  }, []);

  const loadIngredients = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<IngredientDTO[]>('/inventory/ingredients');
      if (response.success) {
        setIngredients(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar insumos:', error);
    } finally {
      setIsLoading(false);
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
      loadIngredients();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      throw error;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Estoque e Insumos</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Gerencie sua matéria-prima e custos de produção.</p>
        </div>
        <button
          onClick={() => {
            setEditingIngredient(null);
            setIsModalOpen(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <span className="text-xl">+</span> Novo Insumo
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-900/50/50 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Insumo</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">SKU</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Unidade</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Custo Atual</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Estoque Atual</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {ingredients.map((ing) => (
                <tr key={ing.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{ing.name}</div>
                    {ing.description && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{ing.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 font-mono">{ing.sku || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{unitLabels[ing.unit]}</td>
                  <td className="px-6 py-4 text-sm font-medium text-green-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ing.currentCost)}
                  </td>
                  <td className="px-6 py-4 text-sm text-left">
                    <span className={`font-semibold ${Number(ing.currentStock) <= Number(ing.minStock || 0) ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {ing.currentStock}
                    </span>
                    <span className="text-gray-400 text-xs ml-1">{ing.unit}</span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => {
                        setEditingIngredient(ing);
                        setIsModalOpen(true);
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {ingredients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    Nenhum insumo cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <IngredientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        editingIngredient={editingIngredient}
      />
    </div>
  );
}
