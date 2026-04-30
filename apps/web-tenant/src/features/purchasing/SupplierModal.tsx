import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { SupplierDTO, CreateSupplierDTO } from '@gestor/types';
import { X } from 'lucide-react';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateSupplierDTO) => Promise<void>;
  editingSupplier: SupplierDTO | null;
}

export function SupplierModal({ isOpen, onClose, onSave, editingSupplier }: SupplierModalProps) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateSupplierDTO>();

  useEffect(() => {
    if (editingSupplier) {
      reset({
        name: editingSupplier.name,
        cnpj: editingSupplier.cnpj || '',
        email: editingSupplier.email || '',
        phone: editingSupplier.phone || '',
        active: editingSupplier.active,
      });
    } else {
      reset({
        name: '',
        cnpj: '',
        email: '',
        phone: '',
        active: true,
      });
    }
  }, [editingSupplier, reset]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-primary-50/30">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSave)} className="p-6 space-y-4 text-left">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome / Razão Social</label>
              <input
                {...register('name', { required: 'Nome é obrigatório' })}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                placeholder="Ex: Ambev S.A."
              />
              {errors.name && <span className="text-red-500 text-xs mt-1">{errors.name.message}</span>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">CNPJ / CPF</label>
              <input
                {...register('cnpj')}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                placeholder="00.000.000/0000-00"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">E-mail</label>
                <input
                  {...register('email')}
                  type="email"
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                  placeholder="contato@fornecedor.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Telefone</label>
                <input
                  {...register('phone')}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-800 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
              <input
                type="checkbox"
                {...register('active')}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 dark:border-gray-700 focus:ring-primary-500"
              />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fornecedor Ativo</label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-all shadow-md shadow-primary-500/20"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar Fornecedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
