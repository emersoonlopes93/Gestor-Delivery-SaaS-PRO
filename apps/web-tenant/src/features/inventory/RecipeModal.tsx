import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api-client';
import { 
  IngredientDTO, 
  RecipeIngredientDTO, 
  UpsertRecipeDTO
} from '@gestor/types';

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityId: string;
  entityName: string;
}

export function RecipeModal({ isOpen, onClose, entityId, entityName }: RecipeModalProps) {
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [recipeItems, setRecipeItems] = useState<RecipeIngredientDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ingRes, recipeRes] = await Promise.all([
        api.get<IngredientDTO[]>('/inventory/ingredients'),
        api.get<RecipeIngredientDTO[]>(`/inventory/recipes/product/${entityId}`)
      ]);

      if (ingRes.success) setIngredients(ingRes.data);
      if (recipeRes.success) setRecipeItems(recipeRes.data);
    } catch (error) {
      console.error('Erro ao carregar ficha técnica:', error);
    } finally {
      setIsLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

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

      await api.post(`/inventory/recipes/product/${entityId}`, items);
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
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] text-left border border-border">
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-muted/50">
          <div>
            <h2 className="text-xl font-bold text-foreground">Ficha Técnica</h2>
            <p className="text-sm text-muted-foreground">{entityName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="pb-3 pr-4">Insumo</th>
                    <th className="pb-3 pr-4 w-32">Quantidade</th>
                    <th className="pb-3 text-right">Custo Est.</th>
                    <th className="pb-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recipeItems.map((item, index) => {
                    const ing = ingredients.find(i => i.id === item.ingredientId);
                    const itemCost = Number(item.quantity) * (ing?.currentCost || 0);
                    
                    return (
                      <tr key={item.id} className="group">
                        <td className="py-3 pr-4">
                          <select
                            value={item.ingredientId}
                            onChange={(e) => handleUpdateItem(index, { ingredientId: e.target.value })}
                            className="w-full bg-input-bg border border-input rounded-lg px-2 py-1 text-sm font-medium text-foreground cursor-pointer focus:ring-2 focus:ring-primary/30 outline-none transition-all"
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
                              className="w-full px-2 py-1 rounded border border-input bg-input-bg text-foreground text-sm focus:ring-1 focus:ring-primary outline-none"
                            />
                            <span className="text-xs text-muted-foreground">{ing?.unit}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right text-sm text-muted-foreground">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemCost)}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleRemoveItem(index)}
                            className="text-muted-foreground hover:text-destructive transition-colors text-lg"
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
                className="w-full py-2 border-2 border-dashed border-border rounded-xl text-muted-foreground text-sm font-medium hover:border-primary/55 hover:text-primary transition-all"
              >
                + Adicionar Insumo
              </button>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-muted/50 flex items-center justify-between">
          <div>
            <span className="text-sm text-muted-foreground">Custo Teórico Total:</span>
            <div className="text-xl font-bold text-primary">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Descartar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50 shadow-sm"
            >
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
