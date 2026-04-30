import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { 
  IngredientDTO, 
  RecipeIngredientDTO, 
  UpsertRecipeDTO
} from '@gestor/types';

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'product' | 'complement' | 'combo';
  entityId: string;
  entityName: string;
}

export function RecipeModal({ isOpen, onClose, entityType, entityId, entityName }: RecipeModalProps) {
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [recipeItems, setRecipeItems] = useState<RecipeIngredientDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, entityType, entityId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ingRes, recipeRes] = await Promise.all([
        api.get<IngredientDTO[]>('/inventory/ingredients'),
        api.get<RecipeIngredientDTO[]>(`/inventory/recipes/${entityType}/${entityId}`)
      ]);

      if (ingRes.success) setIngredients(ingRes.data);
      if (recipeRes.success) setRecipeItems(recipeRes.data);
    } catch (error) {
      console.error('Erro ao carregar ficha técnica:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddItem = () => {
    if (ingredients.length === 0) return;
    const firstIng = ingredients[0];
    setRecipeItems([
      ...recipeItems,
      {
        id: Math.random().toString(), // Temp ID for list
        ingredientId: firstIng.id,
        ingredientName: firstIng.name,
        ingredientUnit: firstIng.unit,
        quantity: 0,
        estimatedCost: 0
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, updates: Partial<RecipeIngredientDTO>) => {
    const updated = [...recipeItems];
    const item = { ...updated[index], ...updates };
    
    // If ingredient changed, update unit and name
    if (updates.ingredientId) {
      const ing = ingredients.find(i => i.id === updates.ingredientId);
      if (ing) {
        item.ingredientName = ing.name;
        item.ingredientUnit = ing.unit;
      }
    }
    
    updated[index] = item;
    setRecipeItems(updated);
  };

  const totalCost = (recipeItems || []).reduce((acc, item) => {
    const ing = ingredients.find(i => i.id === item.ingredientId);
    return acc + (Number(item.quantity) * (ing?.currentCost || 0));
  }, 0);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const items: UpsertRecipeDTO[] = (recipeItems || []).map(item => ({
        ingredientId: item.ingredientId,
        quantity: Number(item.quantity)
      }));

      await api.post(`/inventory/recipes/${entityType}/${entityId}`, items);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar ficha técnica:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] text-left">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Ficha Técnica</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{entityName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-400">
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Insumo</th>
                    <th className="pb-3 pr-4 w-32">Quantidade</th>
                    <th className="pb-3 text-right">Custo Est.</th>
                    <th className="pb-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recipeItems.map((item, index) => {
                    const ing = ingredients.find(i => i.id === item.ingredientId);
                    const itemCost = Number(item.quantity) * (ing?.currentCost || 0);
                    
                    return (
                      <tr key={item.id} className="group">
                        <td className="py-3 pr-4">
                          <select
                            value={item.ingredientId}
                            onChange={(e) => handleUpdateItem(index, { ingredientId: e.target.value })}
                            className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                          >
                            {ingredients.map(ing => (
                              <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.001"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(index, { quantity: Number(e.target.value) })}
                              className="w-full px-2 py-1 rounded border border-gray-100 dark:border-gray-800 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                            />
                            <span className="text-xs text-gray-400">{ing?.unit}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemCost)}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleRemoveItem(index)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <button
                onClick={handleAddItem}
                className="w-full py-2 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-gray-400 text-sm font-medium hover:border-primary-200 hover:text-primary-600 transition-all"
              >
                + Adicionar Insumo
              </button>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Custo Teórico Total:</span>
            <div className="text-xl font-bold text-primary-600">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:text-gray-200"
            >
              Descartar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || recipeItems.length === 0}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-all disabled:opacity-50 shadow-sm"
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
