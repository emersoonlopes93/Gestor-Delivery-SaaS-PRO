import React, { useState, useEffect, useMemo } from 'react';
import { IngredientDTO, CreateIngredientDTO, PurchasePresentationDTO, UnitType } from '@gestor/types';
import { CurrencyInput } from '@gestor/ui';
import { Switch } from '../../components/ui/Switch';
import { api } from '../../lib/api-client';

interface IngredientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateIngredientDTO) => Promise<void>;
  editingIngredient: IngredientDTO | null;
}

export function IngredientModal({ isOpen, onClose, onSave, editingIngredient }: IngredientModalProps) {
  const [formData, setFormData] = useState<CreateIngredientDTO & { initialPurchaseActive?: boolean }>({
    name: '',
    sku: '',
    description: '',
    unit: UnitType.G, // Default to g for better precision
    purchaseUnit: UnitType.G,
    conversionFactor: 1,
    category: '',
    minStock: 0,
    initialPurchaseActive: false,
    initialPurchase: {
      quantity: 1,
      unit: UnitType.G,
      totalCost: 0,
    }
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [presentations, setPresentations] = useState<PurchasePresentationDTO[]>([]);
  const [presentationLabel, setPresentationLabel] = useState('');
  const [presentationFactor, setPresentationFactor] = useState<number>(1);
  const [presentationDrafts, setPresentationDrafts] = useState<Array<{ label: string; conversionFactor: number }>>([]);

  useEffect(() => {
    setPresentationDrafts([]);
    setPresentationLabel('');
    setPresentationFactor(1);
    setFormError(null);
    if (editingIngredient) {
      setFormData({
        name: editingIngredient.name,
        sku: editingIngredient.sku || '',
        description: editingIngredient.description || '',
        unit: editingIngredient.unit,
        purchaseUnit: editingIngredient.purchaseUnit || editingIngredient.unit,
        conversionFactor: editingIngredient.conversionFactor ?? 1,
        category: editingIngredient.category || '',
        minStock: editingIngredient.minStock || 0,
        initialPurchaseActive: false,
      });
    } else {
      setFormData({
        name: '',
        sku: '',
        description: '',
        unit: UnitType.G,
        purchaseUnit: UnitType.G,
        conversionFactor: 1,
        category: '',
        minStock: 0,
        initialPurchaseActive: false,
        initialPurchase: {
          quantity: 1,
          unit: UnitType.G,
          totalCost: 0,
        }
      });
    }
  }, [editingIngredient, isOpen]);

  useEffect(() => {
    if (!editingIngredient || !isOpen) {
      setPresentations([]);
      return;
    }
    void api.get<PurchasePresentationDTO[]>(`/inventory/ingredients/${editingIngredient.id}/purchase-presentations`)
      .then((response) => { if (response.success) setPresentations(response.data); })
      .catch(() => setPresentations([]));
  }, [editingIngredient, isOpen]);

  const addPresentation = async () => {
    if (!presentationLabel.trim() || !Number.isFinite(presentationFactor) || presentationFactor <= 0) {
      setFormError('Informe uma apresentacao e um conteudo maior que zero.');
      return;
    }
    if (!editingIngredient) {
      if (presentationDrafts.some((item) => item.label.toLocaleLowerCase() === presentationLabel.trim().toLocaleLowerCase())) {
        setFormError('Essa apresentacao ja foi adicionada.');
        return;
      }
      setPresentationDrafts((current) => [...current, { label: presentationLabel.trim(), conversionFactor: presentationFactor }]);
      setPresentationLabel('');
      setPresentationFactor(1);
      setFormError(null);
      return;
    }
    const response = await api.post<PurchasePresentationDTO>(`/inventory/ingredients/${editingIngredient.id}/purchase-presentations`, {
      label: presentationLabel,
      conversionFactor: presentationFactor,
    });
    if (response.success) {
      setPresentations((current) => [...current, response.data]);
      setPresentationLabel('');
      setPresentationFactor(1);
    }
  };

  const calculatedValues = useMemo(() => {
    if (!formData.initialPurchaseActive || !formData.initialPurchase) return null;
    
    const quantityBase = Number(formData.initialPurchase.quantity);
    const totalCost = Number(formData.initialPurchase.totalCost);
    const costPerBaseUnit = quantityBase > 0 ? totalCost / quantityBase : 0;
    return {
      quantityBase,
      costPerBaseUnit,
    };
  }, [formData.initialPurchase, formData.initialPurchaseActive]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      const payload = { ...formData };
      if (!editingIngredient) payload.purchasePresentations = presentationDrafts;
      delete payload.initialPurchaseActive;
      if (!formData.initialPurchaseActive) {
        delete payload.initialPurchase;
      }
      
      await onSave(payload);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar insumo:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const unitOptions = [
    { value: UnitType.G, label: 'Grama (g)' },
    { value: UnitType.KG, label: 'Quilograma (kg)' },
    { value: UnitType.ML, label: 'Mililitro (ml)' },
    { value: UnitType.L, label: 'Litro (l)' },
    { value: UnitType.UN, label: 'Unidade (un)' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all animate-in zoom-in-95 duration-300 border border-border">
        <div className="px-8 py-5 border-b border-border flex justify-between items-center bg-muted/50">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {editingIngredient ? 'Editar insumo' : 'Novo insumo'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Organize a unidade de estoque, as apresentações de compra e o saldo inicial.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto max-h-[85vh] custom-scrollbar">
          {formError && (
            <div role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {formError}
            </div>
          )}
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-5 bg-primary rounded-full"></div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Dados do insumo</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nome do Insumo *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-input focus:ring-2 focus:ring-primary focus:border-transparent outline-none bg-input-bg text-foreground transition-all"
                  placeholder="Ex: Açúcar Refinado, Farinha de Trigo"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase">SKU / Categoria</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-1/2 px-4 py-2.5 rounded-xl border border-input focus:ring-2 focus:ring-primary outline-none bg-input-bg text-foreground font-mono text-sm"
                    placeholder="Código"
                  />
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-1/2 px-4 py-2.5 rounded-xl border border-input focus:ring-2 focus:ring-primary outline-none bg-input-bg text-foreground text-sm"
                    placeholder="Ex: Secos"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase">Unidade de estoque *</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value as UnitType })}
                  className="w-full px-4 py-2.5 rounded-xl border border-input focus:ring-2 focus:ring-primary outline-none appearance-none bg-input-bg text-foreground cursor-pointer"
                >
                  {unitOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <p className="text-[10px] text-muted-foreground">Use a mesma unidade usada no estoque e nas receitas.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase">Estoque Mínimo</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.minStock}
                  onChange={(e) => setFormData({ ...formData, minStock: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-xl border border-input focus:ring-2 focus:ring-primary outline-none bg-input-bg text-foreground"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-muted/30 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-foreground">Como você compra este insumo?</h3>
              <p className="mt-1 text-xs text-muted-foreground">Cadastre embalagens comerciais. O estoque continua na unidade de estoque.</p>
            </div>
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_9rem_auto]">
                <input value={presentationLabel} onChange={(event) => setPresentationLabel(event.target.value)} className="input-premium" placeholder="Ex.: Pacote com 50" aria-label="Nome da apresentacao de compra" />
                <input value={presentationFactor} onChange={(event) => setPresentationFactor(Number(event.target.value))} min="0.000001" step="any" type="number" className="input-premium" aria-label="Conteudo em unidade base" />
                <button type="button" onClick={() => void addPresentation()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Adicionar</button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Exemplo: 1 pacote = 50 {formData.unit}.</p>
              <div className="mt-4 space-y-2">
                {!editingIngredient && presentationDrafts.map((presentation, index) => (
                  <div key={`${presentation.label}-${index}`} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{presentation.label}</span>
                    <span className="flex items-center gap-3 text-muted-foreground">1 {presentation.label} = {presentation.conversionFactor} {formData.unit}<button type="button" onClick={() => setPresentationDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="text-destructive">Remover</button></span>
                  </div>
                ))}
                {editingIngredient && (presentations.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma apresentação cadastrada. Compras na unidade de estoque continuam disponíveis.</p> : presentations.map((presentation) => (
                  <div key={presentation.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{presentation.label}</span>
                    <span className="text-muted-foreground">1 {presentation.label} = {presentation.conversionFactor} {editingIngredient.unit}{presentation.isActive ? '' : ' · inativa'}</span>
                  </div>
                )))}
              </div>
            </>
          </div>

          <hr className="my-8 border-border" />

          {!editingIngredient && (
            <div className="space-y-5">
              <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="w-1 h-5 bg-green-500 rounded-full"></div>
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Saldo inicial</h3>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3 sm:justify-end">
                  <span className="min-w-0 text-sm font-medium text-muted-foreground">Informar saldo inicial</span>
                  <Switch
                    checked={Boolean(formData.initialPurchaseActive)}
                    onCheckedChange={(initialPurchaseActive) => setFormData({ ...formData, initialPurchaseActive })}
                    aria-label="Informar saldo inicial"
                  />
                </div>
              </div>

              {formData.initialPurchaseActive && (
                <div className="bg-green-500/10 p-6 rounded-2xl border border-green-500/20 space-y-5 animate-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">Quantidade atual ({formData.unit})</label>
                      <input
                        type="number"
                        step="0.01"
                        required={formData.initialPurchaseActive}
                        value={formData.initialPurchase?.quantity}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          initialPurchase: { ...formData.initialPurchase!, quantity: Number(e.target.value) } 
                        })}
                        className="w-full px-4 py-2.5 rounded-xl border border-green-500/20 focus:ring-2 focus:ring-green-500 outline-none bg-input-bg text-foreground"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">Valor total desse estoque (R$)</label>
                      <CurrencyInput
                        value={formData.initialPurchase?.totalCost}
                        onChange={(val) => setFormData({ 
                          ...formData, 
                          initialPurchase: { ...formData.initialPurchase!, totalCost: val } 
                        })}
                        className="w-full rounded-xl border-green-500/20 focus-visible:ring-green-500 bg-input-bg text-foreground"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-green-800 dark:text-green-300">O saldo inicial não é uma compra, não gera pagamento e não precisa de fornecedor.</p>
                  {calculatedValues && (
                    <div className="bg-card p-4 rounded-xl border border-green-500/20 flex flex-wrap gap-6 justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Custo inicial calculado ({formData.unit})</span>
                        <span className="text-lg font-black text-green-600 dark:text-green-400">R$ {calculatedValues.costPerBaseUnit.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Estoque inicial</span>
                        <span className="text-lg font-black text-green-600 dark:text-green-400">{calculatedValues.quantityBase} <span className="text-sm font-medium">{formData.unit}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {editingIngredient && (
            <div className="bg-primary/10 p-4 rounded-xl border border-primary/20 flex items-center gap-3">
              <span className="text-xl text-primary">ℹ️</span>
              <p className="text-sm text-primary">
                O custo atual deste insumo é de <strong>R$ {editingIngredient.currentCost.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}</strong> por <strong>{editingIngredient.unit}</strong>. 
                Para atualizar o estoque e custo, use o módulo de Compras.
              </p>
            </div>
          )}

          <div className="mt-8 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 rounded-xl border border-border text-muted-foreground font-bold hover:bg-muted transition-all uppercase tracking-wide text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 transition-all disabled:opacity-50 uppercase tracking-wide text-sm"
            >
              {isSubmitting ? 'Processando...' : (editingIngredient ? 'Salvar Alterações' : 'Finalizar Cadastro')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
