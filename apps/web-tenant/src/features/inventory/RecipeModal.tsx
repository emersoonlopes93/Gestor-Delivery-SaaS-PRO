import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api-client';
import { IngredientDTO, ProductOptionItemRecipeDTO, ProductRecipeComponentDTO, ProductRecipeComponentInputDTO, ProductRecipeDTO, ProductRecipeDraftCostPreviewDTO, RecipeBaseDTO, UnitType } from '@gestor/types';
import { useTenantAuth } from '../../hooks/use-tenant-auth';

interface RecipeModalProps { isOpen: boolean; onClose: () => void; entityType: 'product' | 'complement' | 'combo'; entityId: string; entityName: string; optionItemId?: string; optionItemName?: string; }
type PickerKind = 'ingredient' | 'base' | null;

const compatibleUnits = (unit: UnitType): UnitType[] => unit === UnitType.G || unit === UnitType.KG ? [UnitType.G, UnitType.KG] : unit === UnitType.ML || unit === UnitType.L ? [UnitType.ML, UnitType.L] : [UnitType.UN];
const preview = (quantity: number, from: UnitType, target: UnitType): number => {
  if (from === target) return quantity;
  if ((from === UnitType.G && target === UnitType.KG) || (from === UnitType.ML && target === UnitType.L)) return quantity / 1000;
  if ((from === UnitType.KG && target === UnitType.G) || (from === UnitType.L && target === UnitType.ML)) return quantity * 1000;
  return quantity;
};
const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const isPositiveQuantity = (value: number) => Number.isFinite(value) && value > 0 && Number.isInteger(value * 1_000_000);

export function RecipeModal({ isOpen, onClose, entityType, entityId, entityName, optionItemId, optionItemName }: RecipeModalProps) {
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [bases, setBases] = useState<RecipeBaseDTO[]>([]);
  const [components, setComponents] = useState<ProductRecipeComponentDTO[]>([]);
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerKind, setPickerKind] = useState<PickerKind>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [draftCost, setDraftCost] = useState<ProductRecipeDraftCostPreviewDTO | null>(null);
  const [isDraftCostLoading, setIsDraftCostLoading] = useState(false);
  const { user } = useTenantAuth();
  const canViewCosts = Boolean(user?.permissions.includes('reports.view_costs') || user?.roles.includes('tenant_owner') || user?.roles.includes('tenant_admin'));

  const recipePath = optionItemId ? `/inventory/recipes/product/${entityId}/option-item/${optionItemId}` : `/inventory/recipes/${entityType}/${entityId}`;
  const loadData = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const [ingredientsResult, basesResult, recipeResult] = await Promise.all([api.get<IngredientDTO[]>('/inventory/ingredients'), api.get<RecipeBaseDTO[]>('/inventory/recipe-bases'), api.get<ProductRecipeDTO | ProductOptionItemRecipeDTO>(recipePath)]);
      if (!ingredientsResult.success || !basesResult.success || !recipeResult.success) throw new Error('Não foi possível carregar a ficha técnica.');
      setIngredients(ingredientsResult.data); setBases(basesResult.data); setComponents(recipeResult.data.components); setTotalCost(recipeResult.data.totalEstimatedCost); setDraftCost(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a ficha técnica.'); }
    finally { setIsLoading(false); }
  }, [recipePath]);
  useEffect(() => { if (isOpen) void loadData(); }, [isOpen, loadData]);

  const draftPayload = useMemo<ProductRecipeComponentInputDTO[]>(() => components.map((component) => component.type === 'ingredient'
    ? { type: 'ingredient', ingredientId: component.ingredientId, inputQuantity: Number(component.inputQuantity), inputUnit: component.inputUnit }
    : { type: 'base', baseId: component.baseId, inputQuantity: Number(component.inputQuantity), inputUnit: component.inputUnit }), [components]);

  useEffect(() => {
    if (!isOpen || isLoading || !canViewCosts) return;
    let cancelled = false;
    setIsDraftCostLoading(true);
    const previewPath = optionItemId
      ? `/inventory/recipes/product/${entityId}/option-item/${optionItemId}/preview-cost`
      : `/inventory/recipes/product/${entityId}/preview-cost`;
    void api.post<ProductRecipeDraftCostPreviewDTO>(previewPath, draftPayload)
      .then((result) => { if (!cancelled && result.success) setDraftCost(result.data); })
      .catch(() => { if (!cancelled) setDraftCost(null); })
      .finally(() => { if (!cancelled) setIsDraftCostLoading(false); });
    return () => { cancelled = true; };
  }, [canViewCosts, draftPayload, entityId, isLoading, isOpen, optionItemId]);

  useEffect(() => {
    if (!pickerKind) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPickerKind(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [pickerKind]);

  const availableIngredients = useMemo(() => ingredients.filter((item) => item.isActive && !components.some((component) => component.type === 'ingredient' && component.ingredientId === item.id)), [components, ingredients]);
  const availableBases = useMemo(() => bases.filter((item) => item.isActive && !components.some((component) => component.type === 'base' && component.baseId === item.id)), [bases, components]);
  const pickerItems = useMemo(() => {
    const items = pickerKind === 'ingredient' ? availableIngredients : availableBases;
    const query = pickerQuery.trim().toLocaleLowerCase('pt-BR');
    return items.filter((item) => !query || item.name.toLocaleLowerCase('pt-BR').includes(query));
  }, [availableBases, availableIngredients, pickerKind, pickerQuery]);
  const openPicker = (kind: Exclude<PickerKind, null>) => { setPickerKind(kind); setPickerQuery(''); };
  const markDirty = () => undefined;
  const addIngredient = (ingredient: IngredientDTO) => { setComponents((current) => [...current, { id: `ingredient-${ingredient.id}`, type: 'ingredient', ingredientId: ingredient.id, ingredientName: ingredient.name, ingredientUnit: ingredient.unit, inputQuantity: 1, inputUnit: ingredient.unit, quantity: 1, normalizedUnit: ingredient.unit, estimatedCost: ingredient.currentCost }]); markDirty(); setPickerKind(null); };
  const addBase = (base: RecipeBaseDTO) => { setComponents((current) => [...current, { id: `base-${base.id}`, type: 'base', baseId: base.id, baseName: base.name, inputQuantity: 1, inputUnit: base.outputUnit, quantity: 1, normalizedUnit: base.outputUnit, isActive: base.isActive }]); markDirty(); setPickerKind(null); };
  const updateComponent = (index: number, field: 'inputQuantity' | 'inputUnit', value: number | UnitType) => { setComponents((current) => current.map((component, componentIndex) => { if (componentIndex !== index) return component; const next = { ...component, [field]: value } as ProductRecipeComponentDTO; if (!compatibleUnits(next.normalizedUnit).includes(next.inputUnit)) next.inputUnit = next.normalizedUnit; next.quantity = preview(Number(next.inputQuantity) || 0, next.inputUnit, next.normalizedUnit); return next; })); markDirty(); };
  const remove = (index: number) => { setComponents((current) => current.filter((_, componentIndex) => componentIndex !== index)); markDirty(); };
  const save = async () => {
    const invalid = components.find((component) => !isPositiveQuantity(Number(component.inputQuantity)));
    if (invalid) { setError(`Informe uma quantidade válida, maior que zero e com até seis casas decimais para ${invalid.type === 'ingredient' ? invalid.ingredientName : invalid.baseName}.`); return; }
    setError(null); setIsSaving(true);
    try {
      const payload: ProductRecipeComponentInputDTO[] = components.map((component) => component.type === 'ingredient' ? { type: 'ingredient', ingredientId: component.ingredientId, inputQuantity: Number(component.inputQuantity), inputUnit: component.inputUnit } : { type: 'base', baseId: component.baseId, inputQuantity: Number(component.inputQuantity), inputUnit: component.inputUnit });
      const result = optionItemId ? await api.put<ProductOptionItemRecipeDTO>(recipePath, payload) : await api.post<ProductRecipeDTO>(recipePath, payload);
      if (!result.success) throw new Error('Não foi possível salvar a ficha técnica.');
      await loadData(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a ficha técnica.'); }
    finally { setIsSaving(false); }
  };

  if (!isOpen) return null;
  const pickerTitle = pickerKind === 'ingredient' ? 'Selecionar insumo' : 'Selecionar preparação';
  const draftCostText = () => {
    if (!canViewCosts) return null;
    if (isDraftCostLoading) return <p className="text-sm text-muted-foreground">Calculando custo do rascunho…</p>;
    if (!draftCost || draftCost.coverage === 'UNKNOWN') return <><div className="text-base font-semibold text-muted-foreground">Custo do rascunho indisponível</div><p className="mt-1 text-xs text-muted-foreground">Há componentes sem custo atual confiável.</p></>;
    if (draftCost.coverage === 'PARTIAL') return <><div className="text-xl font-bold text-status-warning">Parcial: {formatCurrency(draftCost.partialEstimatedTotalCost ?? 0)}</div><p className="mt-1 text-xs text-status-warning">{draftCost.unknownIngredientCount} componente(s) sem custo confiável.</p></>;
    return <><div className="text-xl font-bold text-primary">{formatCurrency(draftCost.estimatedTotalCost ?? 0)}</div><p className="mt-1 text-xs text-muted-foreground">Custo do rascunho, baseado nos custos atuais dos insumos.</p></>;
  };
  return <><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="recipe-title" className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-xl">
    <div className="flex items-center justify-between border-b border-border bg-muted/50 px-6 py-4"><div><h2 id="recipe-title" className="text-xl font-bold text-foreground">Ficha Técnica</h2><p className="text-sm text-muted-foreground">{entityName}{optionItemName ? ` · ${optionItemName}` : ''}</p></div><button type="button" aria-label="Fechar ficha técnica" onClick={onClose} className="text-2xl text-muted-foreground hover:text-foreground">×</button></div>
    <div className="flex-1 space-y-4 overflow-y-auto p-6">{error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}{isLoading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div> : <><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openPicker('ingredient')} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:border-primary">+ Adicionar insumo</button><button type="button" onClick={() => openPicker('base')} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:border-primary">+ Adicionar preparação</button></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2">Componente</th><th>Tipo</th><th>Quantidade</th><th>Unidade</th><th>Normalizado</th><th /></tr></thead><tbody>{components.map((component, index) => { const archivedBase = component.type === 'base' && !component.isActive; const name = component.type === 'ingredient' ? component.ingredientName : component.baseName; return <tr key={`${component.type}-${component.id}-${index}`} className="border-b border-border/60"><td className="py-3 font-medium text-foreground">{name}{archivedBase && <span className="ml-2 text-xs text-status-warning">Arquivada</span>}</td><td>{component.type === 'ingredient' ? 'Insumo' : 'Preparação'}</td><td><input aria-label={`Quantidade de ${name}`} disabled={archivedBase} type="number" min="0.000001" step="0.000001" value={component.inputQuantity} onChange={(event) => updateComponent(index, 'inputQuantity', Number(event.target.value))} className="input-premium w-28" /></td><td><select aria-label={`Unidade de ${name}`} disabled={archivedBase} value={component.inputUnit} onChange={(event) => updateComponent(index, 'inputUnit', event.target.value as UnitType)} className="input-premium w-20">{compatibleUnits(component.normalizedUnit).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></td><td className="text-muted-foreground">= {component.quantity} {component.normalizedUnit}</td><td className="text-right"><button type="button" onClick={() => remove(index)} className="text-destructive">Remover</button></td></tr>; })}</tbody></table>{components.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sem ficha técnica. Salve vazio para manter o produto sem composição.</p>}</div></>}</div>
    <div className="flex items-center justify-between border-t border-border bg-muted/50 px-6 py-4"><div><span className="text-sm text-muted-foreground">{canViewCosts ? 'Custo estimado do rascunho' : 'Custo teórico total'}</span>{canViewCosts ? draftCostText() : <div className="text-xl font-bold text-primary">{totalCost === null ? 'Sem custo cadastrado' : formatCurrency(totalCost)}</div>}</div><div className="flex gap-3"><button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">Cancelar</button><button type="button" disabled={isSaving} onClick={() => void save()} className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{isSaving ? 'Salvando…' : 'Salvar ficha técnica'}</button></div></div>
  </div></div>{pickerKind && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerKind(null); }}><div role="dialog" aria-modal="true" aria-labelledby="recipe-picker-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 id="recipe-picker-title" className="font-semibold text-foreground">{pickerTitle}</h3><p className="text-sm text-muted-foreground">Itens já vinculados e arquivados não podem ser adicionados novamente.</p></div><button type="button" aria-label="Cancelar seleção" onClick={() => setPickerKind(null)} className="text-xl text-muted-foreground">×</button></div><input autoFocus value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="Buscar por nome" className="input-premium mt-4 w-full" /><div className="mt-3 max-h-[50dvh] divide-y divide-border overflow-y-auto rounded-lg border border-border">{pickerItems.map((item) => <button type="button" key={item.id} onClick={() => pickerKind === 'ingredient' ? addIngredient(item as IngredientDTO) : addBase(item as RecipeBaseDTO)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted"><span className="font-medium text-foreground">{item.name}</span><span className="text-xs text-muted-foreground">{pickerKind === 'ingredient' ? (item as IngredientDTO).unit : (item as RecipeBaseDTO).outputUnit}</span></button>)}{pickerItems.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum item elegível encontrado.</p>}</div><div className="mt-4 flex justify-end"><button type="button" onClick={() => setPickerKind(null)} className="px-4 py-2 text-sm text-muted-foreground">Cancelar</button></div></div></div>, document.body)}</>;
}
