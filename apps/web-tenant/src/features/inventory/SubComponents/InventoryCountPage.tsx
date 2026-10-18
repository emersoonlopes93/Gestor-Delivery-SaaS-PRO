import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api-client';
import { IngredientDTO, InventoryCountDTO, UnitType } from '@gestor/types';
import { AlertTriangle, CheckCircle2, ClipboardList, RefreshCcw, Save } from 'lucide-react';
import {
  createInventoryCountClosure,
  createInventoryCountOpening,
  INVENTORY_API_PATHS,
} from '../inventory-api-contract';

interface CountItem {
  ingredientId: string;
  name: string;
  unit: UnitType;
  theoreticalStock: number;
  physicalStock: string;
}

const unitLabels: Record<UnitType, string> = {
  [UnitType.UN]: 'Unidade',
  [UnitType.G]: 'Grama (g)',
  [UnitType.KG]: 'Quilograma (kg)',
  [UnitType.ML]: 'Mililitro (ml)',
  [UnitType.L]: 'Litro (l)',
};

export function InventoryCountPage() {
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [countItems, setCountItems] = useState<CountItem[]>([]);
  const [inventoryCountId, setInventoryCountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadIngredients = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.get<IngredientDTO[]>(INVENTORY_API_PATHS.ingredients);
      if (!response.success) return;

      setIngredients(response.data);
      if (response.data.length === 0) {
        setInventoryCountId(null);
        setCountItems([]);
        return;
      }

      const opening = await api.post<InventoryCountDTO>(
        INVENTORY_API_PATHS.openCount,
        createInventoryCountOpening(response.data.map((ingredient) => ingredient.id)),
      );
      const ingredientById = new Map(response.data.map((ingredient) => [ingredient.id, ingredient]));
      const openedItems = opening.data.items ?? [];
      setInventoryCountId(opening.data.id);
      setCountItems(openedItems.map((item) => {
        const ingredient = ingredientById.get(item.ingredientId);
        return {
          ingredientId: item.ingredientId,
          name: item.ingredientName ?? ingredient?.name ?? 'Insumo',
          unit: item.ingredientUnit ?? ingredient?.unit ?? UnitType.UN,
          theoreticalStock: item.theoreticalStock,
          physicalStock: item.physicalStock.toString(),
        };
      }));
    } catch (error) {
      console.error('Erro ao iniciar inventário:', error);
      setInventoryCountId(null);
      setCountItems([]);
      setErrorMessage('Não foi possível iniciar a contagem. Atualize a página e tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadIngredients();
  }, []);

  const handleStockChange = (ingredientId: string, value: string) => {
    setCountItems((previous) => previous.map((item) =>
      item.ingredientId === ingredientId ? { ...item, physicalStock: value } : item,
    ));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSuccess(false);
    setErrorMessage(null);
    try {
      if (!inventoryCountId) {
        setErrorMessage('A contagem ainda não foi iniciada. Atualize o estoque antes de finalizar.');
        return;
      }
      const hasInvalidStock = countItems.some((item) => {
        const value = Number(item.physicalStock);
        return item.physicalStock.trim() === '' || !Number.isFinite(value) || value < 0;
      });
      if (hasInvalidStock) {
        setErrorMessage('Informe uma contagem física válida e não negativa para todos os insumos.');
        return;
      }

      const items = countItems.map((item) => ({
        ingredientId: item.ingredientId,
        physicalStock: Number(item.physicalStock),
      }));
      await api.post(
        INVENTORY_API_PATHS.closeCount(inventoryCountId),
        createInventoryCountClosure(items),
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
      await loadIngredients();
    } catch (error) {
      console.error('Erro ao finalizar inventário:', error);
      if (error instanceof ApiError && error.status === 409) {
        setErrorMessage('O estoque mudou durante a contagem. Atualize a contagem, revise os valores e finalize novamente.');
      } else {
        setErrorMessage('Não foi possível finalizar o inventário. Verifique os dados e tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-primary" />
            Inventário Físico
          </h1>
          <p className="text-muted-foreground mt-1">Conte o estoque físico. O saldo do sistema é confirmado pelo servidor ao finalizar.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void loadIngredients()}
            className="p-2.5 text-muted-foreground hover:bg-muted rounded-xl transition-colors disabled:opacity-50"
            title="Iniciar uma nova contagem com o estoque atualizado"
            disabled={isLoading || isSubmitting}
          >
            <RefreshCcw className="h-5 w-5" />
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={isLoading || isSubmitting || ingredients.length === 0 || !inventoryCountId}
            className="bg-primary hover:opacity-90 text-primary-foreground px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="h-5 w-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            Finalizar contagem
          </button>
        </div>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center gap-3 text-green-600 dark:text-green-400 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Inventário processado com sucesso. O estoque foi ajustado.</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400" role="alert">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Insumo</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Unidade</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Estoque do sistema</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider w-48">Contagem física</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Diferença (prévia)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
                  </td>
                </tr>
              ) : countItems.map((item) => {
                const diff = Number(item.physicalStock) - item.theoreticalStock;
                const hasDiff = Number.isFinite(diff) && diff !== 0;
                return (
                  <tr key={item.ingredientId} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4"><div className="font-semibold text-foreground">{item.name}</div></td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{unitLabels[item.unit]}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {item.theoreticalStock} <span className="text-[10px] uppercase">{item.unit}</span>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={item.physicalStock}
                        onChange={(event) => handleStockChange(item.ingredientId, event.target.value)}
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
                <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">Nenhum insumo encontrado para inventário.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4">
        <div className="p-3 bg-card rounded-xl shadow-sm border border-border"><AlertTriangle className="h-6 w-6 text-amber-500" /></div>
        <div className="flex-1 text-center md:text-left">
          <h4 className="font-bold text-amber-800 dark:text-amber-300">Atenção ao finalizar</h4>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
            Ao finalizar, o servidor confirma que o estoque não mudou e gera ajustes somente para as diferenças encontradas.
            Se houver movimentação durante a contagem, você deverá atualizar e revisar os valores.
          </p>
        </div>
      </div>
    </div>
  );
}
