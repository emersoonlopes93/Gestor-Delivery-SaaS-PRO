import React, { useState, useEffect, useMemo } from 'react';
import { IngredientDTO, CreateIngredientDTO, UnitType } from '@gestor/types';

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
    purchaseUnit: UnitType.KG,
    conversionFactor: 1000,
    category: '',
    minStock: 0,
    initialPurchaseActive: false,
    initialPurchase: {
      quantity: 1,
      unit: UnitType.KG,
      totalCost: 0,
    }
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingIngredient) {
      setFormData({
        name: editingIngredient.name,
        sku: editingIngredient.sku || '',
        description: editingIngredient.description || '',
        unit: editingIngredient.unit,
        purchaseUnit: editingIngredient.purchaseUnit || editingIngredient.unit,
        conversionFactor: editingIngredient.conversionFactor || 1,
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
        purchaseUnit: UnitType.KG,
        conversionFactor: 1000,
        category: '',
        minStock: 0,
        initialPurchaseActive: false,
        initialPurchase: {
          quantity: 1,
          unit: UnitType.KG,
          totalCost: 0,
        }
      });
    }
  }, [editingIngredient, isOpen]);

  // Auto-detect conversion factor
  useEffect(() => {
    if (editingIngredient) return; // Don't auto-change during edit

    let factor = 1;
    if (formData.unit === UnitType.G && formData.purchaseUnit === UnitType.KG) factor = 1000;
    if (formData.unit === UnitType.ML && formData.purchaseUnit === UnitType.L) factor = 1000;
    
    if (factor !== formData.conversionFactor) {
      setFormData(prev => ({ ...prev, conversionFactor: factor }));
    }
  }, [formData.unit, formData.purchaseUnit, editingIngredient, formData.conversionFactor]);

  const calculatedValues = useMemo(() => {
    if (!formData.initialPurchaseActive || !formData.initialPurchase) return null;
    
    const factor = Number(formData.conversionFactor) || 1;
    const quantityBase = Number(formData.initialPurchase.quantity) * factor;
    const totalCost = Number(formData.initialPurchase.totalCost);
    const costPerBaseUnit = quantityBase > 0 ? totalCost / quantityBase : 0;
    const costPerPurchaseUnit = Number(formData.initialPurchase.quantity) > 0 ? totalCost / Number(formData.initialPurchase.quantity) : 0;

    return {
      quantityBase,
      costPerBaseUnit,
      costPerPurchaseUnit
    };
  }, [formData.initialPurchase, formData.conversionFactor, formData.initialPurchaseActive]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = { ...formData };
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all animate-in zoom-in-95 duration-300">
        <div className="px-8 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50/80">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editingIngredient ? 'Refatorar Insumo' : 'Novo Insumo Mestre'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Defina a unidade base para precisão na ficha técnica.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-all">
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto max-h-[85vh] custom-scrollbar">
          {/* BLOCO A - DADOS DO INSUMO */}
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-5 bg-primary-500 rounded-full"></div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">Bloco A — Dados do Insumo</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">Nome do Insumo *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                  placeholder="Ex: Açúcar Refinado, Farinha de Trigo"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">SKU / Categoria</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-1/2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                    placeholder="Código"
                  />
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-1/2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                    placeholder="Ex: Secos"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">Unidade Base (Consumo) *</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value as UnitType })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500 outline-none appearance-none bg-white dark:bg-gray-900 cursor-pointer"
                >
                  {unitOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <p className="text-[10px] text-gray-400">Usada na ficha técnica (Ex: g, ml)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">Fator de Conversão</label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.conversionFactor}
                  onChange={(e) => setFormData({ ...formData, conversionFactor: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                />
                <p className="text-[10px] text-gray-400">Ex: 1000 se base=g e compra=kg</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">Estoque Mínimo</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.minStock}
                  onChange={(e) => setFormData({ ...formData, minStock: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
            </div>
          </div>

          <hr className="my-8 border-gray-100 dark:border-gray-800" />

          {/* BLOCO B - COMPRA INICIAL / ENTRADA INICIAL */}
          {!editingIngredient && (
            <div className="space-y-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-emerald-500 rounded-full"></div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider">Bloco B — Entrada de Estoque</h3>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={formData.initialPurchaseActive}
                    onChange={(e) => setFormData({ ...formData, initialPurchaseActive: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-gray-900 after:border-gray-300 dark:border-gray-700 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  <span className="ml-3 text-sm font-medium text-gray-600 dark:text-gray-400">Lançar compra agora</span>
                </label>
              </div>

              {formData.initialPurchaseActive && (
                <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-5 animate-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-emerald-800 uppercase">Quantidade Comprada</label>
                      <input
                        type="number"
                        step="0.01"
                        required={formData.initialPurchaseActive}
                        value={formData.initialPurchase?.quantity}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          initialPurchase: { ...formData.initialPurchase!, quantity: Number(e.target.value) } 
                        })}
                        className="w-full px-4 py-2.5 rounded-xl border border-emerald-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-emerald-800 uppercase">Unidade da Compra</label>
                      <select
                        value={formData.initialPurchase?.unit}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          initialPurchase: { ...formData.initialPurchase!, unit: e.target.value as UnitType } 
                        })}
                        className="w-full px-4 py-2.5 rounded-xl border border-emerald-200 focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-gray-900 cursor-pointer"
                      >
                        {unitOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-emerald-800 uppercase">Custo Total Pago (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        required={formData.initialPurchaseActive}
                        value={formData.initialPurchase?.totalCost}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          initialPurchase: { ...formData.initialPurchase!, totalCost: Number(e.target.value) } 
                        })}
                        className="w-full px-4 py-2.5 rounded-xl border border-emerald-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  {/* BLOCO C - RESULTADO AUTOMÁTICO */}
                  {calculatedValues && (
                    <div className="bg-white dark:bg-gray-900/80 p-4 rounded-xl border border-emerald-100 flex flex-wrap gap-6 justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Custo p/ Unidade Base ({formData.unit})</span>
                        <span className="text-lg font-black text-emerald-700">R$ {calculatedValues.costPerBaseUnit.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Custo p/ Unidade Compra ({formData.initialPurchase?.unit})</span>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">R$ {calculatedValues.costPerPurchaseUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Estoque Inicial Total</span>
                        <span className="text-lg font-black text-emerald-700">{calculatedValues.quantityBase} <span className="text-sm font-medium">{formData.unit}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {editingIngredient && (
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center gap-3">
              <span className="text-xl text-blue-500">ℹ️</span>
              <p className="text-sm text-blue-700">
                O custo atual deste insumo é de <strong>R$ {editingIngredient.currentCost.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}</strong> por <strong>{editingIngredient.unit}</strong>. 
                Para atualizar o estoque e custo, use o módulo de Compras.
              </p>
            </div>
          )}

          <div className="mt-8 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50 transition-all uppercase tracking-wide text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 shadow-lg shadow-primary-200 transition-all disabled:opacity-50 uppercase tracking-wide text-sm"
            >
              {isSubmitting ? 'Processando...' : (editingIngredient ? 'Salvar Alterações' : 'Finalizar Cadastro')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
