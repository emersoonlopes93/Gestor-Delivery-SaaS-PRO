import { useEffect, useMemo, useState } from 'react';
import { IngredientDTO, RecipeBaseComponentDTO, RecipeBaseDTO, RecipeBaseDetailDTO, UnitType, UpsertRecipeBaseComponentDTO } from '@gestor/types';
import { api } from '../../../lib/api-client';

type DraftComponent = RecipeBaseComponentDTO;

const units = Object.values(UnitType);

export function RecipeBasesPage() {
  const [bases, setBases] = useState<RecipeBaseDTO[]>([]);
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);
  const [editing, setEditing] = useState<RecipeBaseDetailDTO | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState<UnitType>(UnitType.UN);
  const [yieldQuantity, setYieldQuantity] = useState('1');
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [basesResult, ingredientsResult] = await Promise.all([
      api.get<RecipeBaseDTO[]>('/inventory/recipe-bases'),
      api.get<IngredientDTO[]>('/inventory/ingredients'),
    ]);
    if (basesResult.success) setBases(basesResult.data);
    if (ingredientsResult.success) setIngredients(ingredientsResult.data);
  };

  useEffect(() => { void load(); }, []);

  const openEditor = async (base?: RecipeBaseDTO) => {
    setError(null);
    if (!base) {
      setEditing(null); setName(''); setDescription(''); setUnit(UnitType.UN); setYieldQuantity('1'); setComponents([]); setOpen(true);
      return;
    }
    try {
      const result = await api.get<RecipeBaseDetailDTO>(`/inventory/recipe-bases/${base.id}`);
      if (!result.success) throw new Error('Não foi possível carregar a preparação.');
      setEditing(result.data); setName(result.data.name); setDescription(result.data.description ?? ''); setUnit(result.data.outputUnit); setYieldQuantity(String(result.data.yieldQuantity)); setComponents(result.data.components); setOpen(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a preparação.'); }
  };

  const archivedParent = editing !== null && !editing.isActive;
  const selectableBases = useMemo(() => bases.filter((base) => base.isActive && base.id !== editing?.id), [bases, editing?.id]);
  const selectableIngredients = useMemo(() => ingredients.filter((ingredient) => ingredient.isActive), [ingredients]);

  const addIngredient = (ingredientId: string) => {
    if (!ingredientId || components.some((component) => component.type === 'ingredient' && component.ingredientId === ingredientId)) return;
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) return;
    setComponents((current) => [...current, { id: `ingredient-${ingredient.id}`, type: 'ingredient', ingredientId: ingredient.id, ingredientName: ingredient.name, ingredientUnit: ingredient.unit, quantity: 1, sortOrder: current.length }]);
  };
  const addBase = (baseId: string) => {
    if (!baseId || components.some((component) => component.type === 'base' && component.baseId === baseId)) return;
    const base = bases.find((item) => item.id === baseId);
    if (!base) return;
    setComponents((current) => [...current, { id: `base-${base.id}`, type: 'base', baseId: base.id, baseName: base.name, outputUnit: base.outputUnit, isActive: base.isActive, quantity: 1, sortOrder: current.length }]);
  };
  const changeQuantity = (index: number, value: string) => {
    const quantity = Number(value);
    setComponents((current) => current.map((component, itemIndex) => itemIndex === index ? { ...component, quantity } : component));
  };
  const remove = (index: number) => setComponents((current) => current.filter((_, itemIndex) => itemIndex !== index).map((component, itemIndex) => ({ ...component, sortOrder: itemIndex })));

  const save = async () => {
    setError(null); setSaving(true);
    try {
      const metadata = { name, description: description || null, outputUnit: unit, yieldQuantity: Number(yieldQuantity) };
      let base = editing;
      if (!base) {
        const created = await api.post<RecipeBaseDTO>('/inventory/recipe-bases', metadata);
        if (!created.success) throw new Error('Não foi possível criar a preparação.');
        base = { ...created.data, components: [] };
      } else {
        const updated = await api.put<RecipeBaseDTO>(`/inventory/recipe-bases/${base.id}`, metadata);
        if (!updated.success) throw new Error('Não foi possível salvar os dados da preparação.');
      }
      const payload: UpsertRecipeBaseComponentDTO[] = components.map((component, sortOrder) => component.type === 'ingredient'
        ? { type: 'ingredient', ingredientId: component.ingredientId, quantity: component.quantity, sortOrder }
        : { type: 'base', baseId: component.baseId, quantity: component.quantity, sortOrder });
      const composition = await api.put<RecipeBaseDetailDTO>(`/inventory/recipe-bases/${base.id}/components`, payload);
      if (!composition.success) throw new Error('Não foi possível salvar a composição.');
      setEditing(composition.data); setComponents(composition.data.components); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a preparação.'); return; }
    finally { setSaving(false); }
  };

  const toggle = async (base: RecipeBaseDTO) => {
    try { await api.post(`/inventory/recipe-bases/${base.id}/${base.isActive ? 'archive' : 'restore'}`, {}); await load(); if (editing?.id === base.id) await openEditor({ ...base, isActive: !base.isActive }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível alterar o status.'); }
  };

  return <div className="space-y-4 p-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-sm text-muted-foreground">Preparações reutilizáveis não possuem estoque nem custo próprio.</p><button type="button" onClick={() => void openEditor()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Nova preparação</button></div>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
    <div className="divide-y divide-border">{bases.map((base) => <div key={base.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-semibold text-foreground">{base.name}</p><p className="text-sm text-muted-foreground">Rendimento: {base.yieldQuantity} {base.outputUnit}{base.description ? ` · ${base.description}` : ''}</p></div><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{base.isActive ? 'Ativa' : 'Arquivada'}</span><button type="button" onClick={() => void openEditor(base)} className="text-sm text-primary">Ver / editar</button><button type="button" onClick={() => void toggle(base)} className="text-sm text-primary">{base.isActive ? 'Arquivar' : 'Restaurar'}</button></div></div>)}{bases.length === 0 && <p className="py-10 text-center text-muted-foreground">Nenhuma preparação cadastrada.</p>}</div>
    {open && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"><div role="dialog" aria-modal="true" aria-labelledby="recipe-base-title" className="mx-auto my-4 w-full max-w-4xl rounded-xl bg-card p-5 shadow-xl"><div className="mb-4 flex items-start justify-between gap-4"><div><h2 id="recipe-base-title" className="text-lg font-semibold text-foreground">{editing ? 'Editar preparação' : 'Nova preparação'}</h2><p className="text-sm text-muted-foreground">{archivedParent ? 'Esta preparação está arquivada. Restaure-a para editar.' : 'Defina o rendimento e os componentes que formam esta preparação.'}</p></div><button type="button" onClick={() => setOpen(false)} className="text-sm text-muted-foreground">Fechar</button></div>
      {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <fieldset disabled={archivedParent || saving} className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><label className="space-y-1 md:col-span-2"><span className="text-xs font-medium text-muted-foreground">Nome</span><input value={name} onChange={(event) => setName(event.target.value)} className="input-premium w-full" /></label><label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Rendimento</span><input type="number" min="0.000001" step="0.000001" value={yieldQuantity} onChange={(event) => setYieldQuantity(event.target.value)} className="input-premium w-full" /></label><label className="space-y-1"><span className="text-xs font-medium text-muted-foreground">Unidade</span><select value={unit} onChange={(event) => setUnit(event.target.value as UnitType)} className="input-premium w-full">{units.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="space-y-1 md:col-span-2"><span className="text-xs font-medium text-muted-foreground">Descrição</span><input value={description} onChange={(event) => setDescription(event.target.value)} className="input-premium w-full" /></label></div>
        <section className="space-y-3 rounded-xl border border-border p-4"><div><h3 className="font-semibold text-foreground">Composição</h3><p className="text-xs text-muted-foreground">Edite localmente e salve toda a composição em uma única operação.</p></div><div className="grid gap-2 sm:grid-cols-2"><label className="text-sm text-muted-foreground">Adicionar insumo<select defaultValue="" onChange={(event) => { addIngredient(event.target.value); event.currentTarget.value = ''; }} className="input-premium mt-1 w-full"><option value="">Selecione um insumo</option>{selectableIngredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</select></label><label className="text-sm text-muted-foreground">Adicionar base<select defaultValue="" onChange={(event) => { addBase(event.target.value); event.currentTarget.value = ''; }} className="input-premium mt-1 w-full"><option value="">Selecione uma base ativa</option>{selectableBases.map((base) => <option key={base.id} value={base.id}>{base.name} ({base.outputUnit})</option>)}</select></label></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2">Componente</th><th>Tipo</th><th>Unidade</th><th>Quantidade</th><th className="text-right">Ações</th></tr></thead><tbody>{components.map((component, index) => { const archivedChild = component.type === 'base' && !component.isActive; return <tr key={`${component.type}-${component.id}-${index}`} className="border-b border-border/60"><td className="py-2 font-medium text-foreground">{component.type === 'ingredient' ? component.ingredientName : component.baseName}{archivedChild && <span className="ml-2 text-xs text-status-warning">Arquivada</span>}</td><td>{component.type === 'ingredient' ? 'Insumo' : 'Base'}</td><td>{component.type === 'ingredient' ? component.ingredientUnit : component.outputUnit}</td><td><input aria-label={`Quantidade de ${component.type === 'ingredient' ? component.ingredientName : component.baseName}`} disabled={archivedChild} type="number" min="0.000001" step="0.000001" value={component.quantity} onChange={(event) => changeQuantity(index, event.target.value)} className="input-premium w-28" /></td><td className="text-right"><button type="button" onClick={() => remove(index)} className="text-sm text-destructive">Remover</button></td></tr>; })}</tbody></table>{components.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">Adicione insumos ou bases para compor esta preparação.</p>}</div></section></fieldset>
      <div className="mt-5 flex justify-end gap-3">{archivedParent ? <button type="button" onClick={() => editing && void toggle(editing)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Restaurar preparação</button> : <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{saving ? 'Salvando…' : 'Salvar preparação'}</button>}</div>
    </div></div>}
  </div>;
}
