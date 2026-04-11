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
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Estoque e Insumos</h1>
          <p className="text-gray-500 mt-1">Gerencie sua matéria-prima e custos de produção.</p>
        </div>
        <button
          onClick={() => {
            setEditingIngredient(null);
            setIsModalOpen(true);
          }}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm flex items-center gap-2"
        >
          <span className="text-xl">+</span> Novo Insumo
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 font-sans">Insumo</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 font-sans">SKU</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 font-sans">Unidade</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 font-sans">Custo Atual</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 font-sans">Estoque Atual</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-600 font-sans">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ingredients.map((ing) => (
                <tr key={ing.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{ing.name}</div>
                    {ing.description && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{ing.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">{ing.sku || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{unitLabels[ing.unit]}</td>
                  <td className="px-6 py-4 text-sm font-medium text-green-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ing.currentCost)}
                  </td>
                  <td className="px-6 py-4 text-sm text-left">
                    <span className={`font-semibold ${Number(ing.currentStock) <= Number(ing.minStock || 0) ? 'text-red-500' : 'text-gray-700'}`}>
                      {ing.currentStock}
                    </span>
                    <span className="text-gray-400 text-xs ml-1">{ing.unit}</span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => {
                        setEditingIngredient(ing);
                        setIsModalOpen(true);
                      }}
                      className="text-primary-600 hover:text-primary-700 font-medium"
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
