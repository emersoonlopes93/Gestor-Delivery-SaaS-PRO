import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { IngredientDTO, UnitType } from '@gestor/types';
import { ClipboardList, Save, AlertTriangle, CheckCircle2, RefreshCcw } from 'lucide-react';
import { createInventoryCountSubmission, INVENTORY_API_PATHS } from '../inventory-api-contract';
import { usePermissions } from '@/hooks/use-tenant-auth';

interface CountItem {
  ingredientId: string;
  name: string;
  unit: UnitType;
  theoreticalStock: number;
  physicalStock: string;
}

export function InventoryCountPage() {
  const { has } = usePermissions();
  const canAdjustInventory = has('inventory.adjust');
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [countItems, setCountItems] = useState<CountItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadIngredients();
  }, []);

  const loadIngredients = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<IngredientDTO[]>(INVENTORY_API_PATHS.ingredients);
      if (response.success) {
        setIngredients(response.data);
        setCountItems(response.data.map((ing: IngredientDTO) => ({
          ingredientId: ing.id,
          name: ing.name,
          unit: ing.unit,
          theoreticalStock: Number(ing.currentStock),
          physicalStock: ing.currentStock.toString(),
        })));
      }
    } catch (error) {
      console.error('Erro ao carregar insumos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStockChange = (ingredientId: string, value: string) => {
    setCountItems(prev => prev.map(item => 
      item.ingredientId === ingredientId ? { ...item, physicalStock: value } : item
    ));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSuccess(false);
    try {
      const items = countItems.map(item => ({
        ingredientId: item.ingredientId,
        physicalStock: Number(item.physicalStock),
      }));

      await api.post(INVENTORY_API_PATHS.counts, createInventoryCountSubmission(items));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
      loadIngredients(); // Refresh theoretical stock
    } catch (error) {
      console.error('Erro ao salvar inventário:', error);
      alert('Erro ao salvar inventário. Verifique os dados e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const unitLabels: Record<UnitType, string> = {
    [UnitType.UN]: 'Unidade',
    [UnitType.G]: 'Grama (g)',
    [UnitType.KG]: 'Quilograma (kg)',
    [UnitType.ML]: 'Mililitro (ml)',
    [UnitType.L]: 'Litro (l)',
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-primary" />
            Inventário Físico
          </h1>
          <p className="text-muted-foreground mt-1">Realize a contagem física e ajuste seu estoque teórico.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadIngredients}
            className="p-2.5 text-muted-foreground hover:bg-muted rounded-xl transition-colors"
            title="Atualizar estoque teórico"
          >
            <RefreshCcw className="h-5 w-5" />
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canAdjustInventory || isSubmitting || ingredients.length === 0}
            className="bg-primary hover:opacity-90 text-primary-foreground px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            Finalizar Contagem Casada
          </button>
        </div>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center gap-3 text-green-600 dark:text-green-400 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Inventário processado com sucesso! O estoque foi ajustado.</span>
        </div>
      )}

      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Insumo</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Unidade</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Sistema (Teórico)</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider w-48">Contagem Física</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  </td>
                </tr>
              ) : countItems.map((item) => {
                const diff = Number(item.physicalStock) - item.theoreticalStock;
                const hasDiff = diff !== 0;

                return (
                  <tr key={item.ingredientId} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-foreground">{item.name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {unitLabels[item.unit]}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {item.theoreticalStock} <span className="text-[10px] uppercase">{item.unit}</span>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        step="any"
                        value={item.physicalStock}
                        onChange={(e) => handleStockChange(item.ingredientId, e.target.value)}
                        className={`w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-bold ${
                          hasDiff ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'border-input bg-input-bg text-foreground'
                        }`}
                      />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {hasDiff ? (
                        <div className={`flex items-center justify-end gap-1.5 text-sm font-bold ${diff > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(4)}
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground/45 text-sm">Sem ajuste</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && countItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    Nenhum insumo encontrado para inventário.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4">
        <div className="p-3 bg-card rounded-xl shadow-sm border border-border">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <div className="flex-1 text-center md:text-left">
          <h4 className="font-bold text-amber-800 dark:text-amber-300">Atenção ao finalizar</h4>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
            Ao salvar esta contagem, o sistema irá gerar movimentos de ajuste automáticos para cada item que apresentar diferença. 
            Isso afetará diretamente o relatório de CMV e perdas do período.
          </p>
        </div>
      </div>
    </div>
  );
}
