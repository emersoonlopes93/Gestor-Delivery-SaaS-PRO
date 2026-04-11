import React, { useState, useEffect } from 'react';
import { IngredientDTO, CreateIngredientDTO, UnitType } from '@gestor/types';

interface IngredientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateIngredientDTO) => Promise<void>;
  editingIngredient: IngredientDTO | null;
}

export function IngredientModal({ isOpen, onClose, onSave, editingIngredient }: IngredientModalProps) {
  const [formData, setFormData] = useState<CreateIngredientDTO>({
    name: '',
    sku: '',
    description: '',
    unit: UnitType.UN,
    currentCost: 0,
    minStock: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingIngredient) {
      setFormData({
        name: editingIngredient.name,
        sku: editingIngredient.sku || '',
        description: editingIngredient.description || '',
        unit: editingIngredient.unit,
        currentCost: editingIngredient.currentCost,
        minStock: editingIngredient.minStock || 0,
      });
    } else {
      setFormData({
        name: '',
        sku: '',
        description: '',
        unit: UnitType.UN,
        currentCost: 0,
        minStock: 0,
      });
    }
  }, [editingIngredient, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Erro ao salvar insumo:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-900">
            {editingIngredient ? 'Editar Insumo' : 'Novo Insumo'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-left">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Nome do Insumo *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
              placeholder="Ex: Alface Americana, Carne Moída, Embalagem P"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">SKU / Código</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-500 outline-none font-mono text-sm"
                placeholder="Ex: INS-001"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Unidade *</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value as UnitType })}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value={UnitType.UN}>Unidade (un)</option>
                <option value={UnitType.G}>Grama (g)</option>
                <option value={UnitType.KG}>Quilograma (kg)</option>
                <option value={UnitType.ML}>Mililitro (ml)</option>
                <option value={UnitType.L}>Litro (l)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Custo Unitário (R$)</label>
              <input
                type="number"
                step="0.0001"
                required
                value={formData.currentCost}
                onChange={(e) => setFormData({ ...formData, currentCost: Number(e.target.value) })}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Alerta Estoque Mínimo</label>
              <input
                type="number"
                step="0.01"
                value={formData.minStock}
                onChange={(e) => setFormData({ ...formData, minStock: Number(e.target.value) })}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Descrição</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-500 outline-none min-h-[80px]"
              placeholder="Notas sobre o fornecedor, qualidade, etc."
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
