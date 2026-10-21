import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api-client';
import { IngredientDTO, ProductRecipeComponentDTO, ProductRecipeComponentInputDTO, ProductRecipeDTO, RecipeBaseDTO, UnitType } from '@gestor/types';

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'product' | 'complement' | 'combo';
  entityId: string;
  entityName: string;
}

const compatibleUnits = (unit: UnitType): UnitType[] => {
  if (unit === UnitType.G || unit === UnitType.KG) return [UnitType.G, UnitType.KG];
  if (unit === UnitType.ML || unit === UnitType.L) return [UnitType.ML, UnitType.L];
  return [UnitType.UN];
};

const preview = (quantity: number, from: UnitType, target: UnitType): number => {
  if (from === target) return quantity;
  if (from === UnitType.G && target === UnitType.KG) return quantity / 1000;
  if (from === UnitType.KG && target === UnitType.G) return quantity * 1000;
  if (from === UnitType.ML && target === UnitType.L) return quantity / 1000;
  if (from === UnitType.L && target === UnitType.ML) return quantity * 1000;
  return quantity;
};

export function RecipeModal({ isOpen, onClose, entityType, entityId, entityName }: RecipeModalProps) {
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [bases, setBases] = useState<RecipeBaseDTO[]>([]);
  const [components, setComponents] = useState<ProductRecipeComponentDTO[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const [ingredientsResult, basesResult, recipeResult] = await Promise.all([
        api.get<IngredientDTO[]>('/inventory/ingredients'),
        api.get<RecipeBaseDTO[]>('/inventory/recipe-bases'),
        api.get<ProductRecipeDTO>(`/inventory/recipes/${entityType}/${entityId}`),
      ]);
      if (!ingredientsResult.success || !basesResult.success || !recipeResult.success) throw new Error('Não foi possível carregar a ficha técnica.');
      setIngredients(ingredientsResult.data); setBases(basesResult.data); setComponents(recipeResult.data.components); setTotalCost(recipeResult.data.totalEstimatedCost);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a ficha técnica.');
    } finally { setIsLoading(false); }
  }, [entityId, entityType]);

  useEffect(() => { if (isOpen) void loadData(); }, [isOpen, loadData]);

  const availableIngredients = useMemo(() => ingredients.filter((ingredient) => ingredient.isActive), [ingredients]);
  const availableBases = useMemo(() => bases.filter((base) => base.isActive), [bases]);
  const addIngredient = () => {
    const ingredient = availableIngredients.find((item) => !components.some((component) => component.type === 'ingredient' && component.ingredientId === item.id));
    if (!ingredient) return;
    setComponents((current) => [...current, { id: `ingredient-${ingredient.id}`, type: 'ingredient', ingredientId: ingredient.id, ingredientName: ingredient.name, ingredientUnit: ingredient.unit, inputQuantity: 1, inputUnit: ingredient.unit, quantity: 1, normalizedUnit: ingredient.unit, estimatedCost: ingredient.currentCost }]);
  };
  const addBase = () => {
    const base = availableBases.find((item) => !components.some((component) => component.type === 'base' && component.baseId === item.id));
    if (!base) return;
    setComponents((current) => [...current, { id: `base-${base.id}`, type: 'base', baseId: base.id, baseName: base.name, inputQuantity: 1, inputUnit: base.outputUnit, quantity: 1, normalizedUnit: base.outputUnit, isActive: base.isActive }]);
  };
  const updateComponent = (index: number, field: 'inputQuantity' | 'inputUnit', value: number | UnitType) => {
    setComponents((current) => current.map((component, componentIndex) => {
      if (componentIndex !== index) return component;
      const next = { ...component, [field]: value } as ProductRecipeComponentDTO;
      const allowed = compatibleUnits(next.normalizedUnit);
      if (!allowed.includes(next.inputUnit)) next.inputUnit = next.normalizedUnit;
      next.quantity = preview(Number(next.inputQuantity) || 0, next.inputUnit, next.normalizedUnit);
      return next;
    }));
  };
  const remove = (index: number) => setComponents((current) => current.filter((_, componentIndex) => componentIndex !== index));
  const save = async () => {
    setError(null); setIsSaving(true);
    try {
      const payload: ProductRecipeComponentInputDTO[] = components.map((component) => component.type === 'ingredient'
        ? { type: 'ingredient', ingredientId: component.ingredientId, inputQuantity: Number(component.inputQuantity), inputUnit: component.inputUnit }
        : { type: 'base', baseId: component.baseId, inputQuantity: Number(component.inputQuantity), inputUnit: component.inputUnit });
      const result = await api.post<ProductRecipeDTO>(`/inventory/recipes/${entityType}/${entityId}`, payload);
      if (!result.success) throw new Error('Não foi possível salvar a ficha técnica.');
      setComponents(result.data.components); setTotalCost(result.data.totalEstimatedCost); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a ficha técnica.'); }
    finally { setIsSaving(false); }
  };

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-labelledby="recipe-title" className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-xl">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-6 py-4"><div><h2 id="recipe-title" className="text-xl font-bold text-foreground">Ficha Técnica</h2><p className="text-sm text-muted-foreground">{entityName}</p></div><button type="button" onClick={onClose} className="text-2xl text-muted-foreground hover:text-foreground">×</button></div>
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        {isLoading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div> : <>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={addIngredient} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:border-primary">+ Adicionar insumo</button><button type="button" onClick={addBase} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:border-primary">+ Adicionar preparação</button></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2">Componente</th><th>Tipo</th><th>Quantidade</th><th>Unidade</th><th>Normalizado</th><th /></tr></thead><tbody>{components.map((component, index) => { const archivedBase = component.type === 'base' && !component.isActive; return <tr key={`${component.type}-${component.id}-${index}`} className="border-b border-border/60"><td className="py-3 font-medium text-foreground">{component.type === 'ingredient' ? component.ingredientName : component.baseName}{archivedBase && <span className="ml-2 text-xs text-status-warning">Arquivada</span>}</td><td>{component.type === 'ingredient' ? 'Insumo' : 'Preparação'}</td><td><input aria-label={`Quantidade de ${component.type === 'ingredient' ? component.ingredientName : component.baseName}`} disabled={archivedBase} type="number" min="0.000001" step="0.000001" value={component.inputQuantity} onChange={(event) => updateComponent(index, 'inputQuantity', Number(event.target.value))} className="input-premium w-28" /></td><td><select disabled={archivedBase} value={component.inputUnit} onChange={(event) => updateComponent(index, 'inputUnit', event.target.value as UnitType)} className="input-premium w-20">{compatibleUnits(component.normalizedUnit).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></td><td className="text-muted-foreground">= {component.quantity} {component.normalizedUnit}</td><td className="text-right"><button type="button" onClick={() => remove(index)} className="text-destructive">Remover</button></td></tr>; })}</tbody></table>{components.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sem ficha técnica. Salve vazio para manter o produto sem composição.</p>}</div>
        </>}
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/50 px-6 py-4"><div><span className="text-sm text-muted-foreground">Custo teórico total</span><div className="text-xl font-bold text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}</div></div><div className="flex gap-3"><button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">Cancelar</button><button type="button" disabled={isSaving} onClick={() => void save()} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{isSaving ? 'Salvando…' : 'Salvar ficha técnica'}</button></div></div>
    </div>
  </div>;
}
