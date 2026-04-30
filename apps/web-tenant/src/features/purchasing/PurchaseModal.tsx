import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { SupplierDTO, IngredientDTO, CreatePurchaseDTO, PaymentStatus } from '@gestor/types';
import { api } from '../../lib/api-client';
import { X, Plus, Trash2, ChevronDown } from 'lucide-react';

interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreatePurchaseDTO) => Promise<void>;
}

export function PurchaseModal({ isOpen, onClose, onSave }: PurchaseModalProps) {
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([]);

  const { register, control, handleSubmit, watch, formState: { isSubmitting } } = useForm<CreatePurchaseDTO>({
    defaultValues: {
      items: [{ ingredientId: '', quantity: 1, unitCost: 0 }],
      paymentStatus: PaymentStatus.PAID,
      purchaseDate: new Date(),
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const items = watch("items");
  const totalValue = items.reduce((acc: number, item: any) => acc + (Number(item.quantity) * Number(item.unitCost)), 0);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [suppRes, ingRes] = await Promise.all([
        api.get<SupplierDTO[]>('/purchasing/suppliers'),
        api.get<IngredientDTO[]>('/inventory/ingredients')
      ]);
      if (suppRes.success) setSuppliers(suppRes.data);
      if (ingRes.success) setIngredients(ingRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-primary-50/30">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Registrar Nova Compra</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSave)} className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Fornecedor</label>
              <div className="relative">
                <select
                  {...register('supplierId', { required: true })}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl appearance-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                >
                  <option value="">Selecione um fornecedor</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Número NF / Referência</label>
              <input
                {...register('number')}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                placeholder="Ex: 001.234"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Data da Compra</label>
              <input
                {...register('purchaseDate')}
                type="date"
                defaultValue={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Itens da Compra</h3>
              <button
                type="button"
                onClick={() => append({ ingredientId: '', quantity: 1, unitCost: 0 })}
                className="text-primary-600 hover:text-primary-700 font-bold text-sm flex items-center gap-1"
              >
                <Plus className="h-4 w-4" /> Adicionar Item
              </button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left border-collapse">
                <thead>
                  <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    <th className="px-2 py-2">Insumo</th>
                    <th className="px-2 py-2 w-32">Quantidade</th>
                    <th className="px-2 py-2 w-40">Custo Unitário</th>
                    <th className="px-2 py-2 w-40 text-right">Subtotal</th>
                    <th className="px-2 py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {fields.map((field: any, index: number) => (
                    <tr key={field.id} className="group">
                      <td className="py-3 px-2">
                        <select
                          {...register(`items.${index}.ingredientId` as const, { required: true })}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg focus:border-primary-500 outline-none text-sm transition-all"
                        >
                          <option value="">Selecione o insumo</option>
                          {ingredients.map(i => (
                            <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-2">
                        <input
                          {...register(`items.${index}.quantity` as const, { required: true, min: 0.0001 })}
                          type="number"
                          step="any"
                          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg focus:border-primary-500 outline-none text-sm"
                        />
                      </td>
                      <td className="py-3 px-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">R$</span>
                          <input
                            {...register(`items.${index}.unitCost` as const, { required: true, min: 0 })}
                            type="number"
                            step="any"
                            className="w-full pl-7 pr-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg focus:border-primary-500 outline-none text-sm"
                          />
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-semibold text-gray-700 dark:text-gray-300 text-sm">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                          (watch(`items.${index}.quantity`) || 0) * (watch(`items.${index}.unitCost`) || 0)
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Status de Pagamento</label>
              <div className="flex gap-4">
                {[
                  { id: PaymentStatus.PAID, label: 'Já Pago', color: 'bg-green-100 text-green-700' },
                  { id: PaymentStatus.PENDING, label: 'Pagar Depois', color: 'bg-red-100 text-red-700' },
                ].map((opt) => (
                  <label key={opt.id} className="flex-1 cursor-pointer">
                    <input
                      {...register('paymentStatus')}
                      type="radio"
                      value={opt.id}
                      className="peer sr-only"
                    />
                    <div className={`text-center px-4 py-2.5 rounded-xl border-2 border-transparent peer-checked:border-primary-500 bg-gray-50 dark:bg-gray-900/50 font-semibold text-sm transition-all ${opt.color}`}>
                      {opt.label}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-primary-600 rounded-2xl p-6 text-white text-right flex flex-col justify-center">
              <div className="text-sm font-medium opacity-80 mb-1 uppercase tracking-wider">Total da Compra</div>
              <div className="text-4xl font-extrabold tracking-tight">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
              </div>
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900/50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit(onSave)}
            disabled={isSubmitting}
            className="px-8 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-500/30 disabled:opacity-50 transition-all"
          >
            {isSubmitting ? 'Finalizando...' : 'Finalizar Compra'}
          </button>
        </div>
      </div>
    </div>
  );
}
