import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { SupplierDTO, CreateSupplierDTO } from '@gestor/types';
import { X } from 'lucide-react';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateSupplierDTO) => Promise<void>;
  editingSupplier: SupplierDTO | null;
}

import { Modal } from '../../components/Modal';

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
      footer={
        <>
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
            className="px-6 py-2 bg-primary-600 text-white text-sm font-bold rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-all shadow-md shadow-primary-500/20"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar Fornecedor'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSave)} className="space-y-4 text-left">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Nome / Razão Social</label>
            <input
              {...register('name', { required: 'Nome é obrigatório' })}
              className="input-premium"
              placeholder="Ex: Ambev S.A."
            />
            {errors.name && <span className="text-red-500 text-xs mt-1">{errors.name.message}</span>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">CNPJ / CPF</label>
            <input
              {...register('cnpj')}
              className="input-premium"
              placeholder="00.000.000/0000-00"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">E-mail</label>
              <input
                {...register('email')}
                type="email"
                className="input-premium"
                placeholder="contato@fornecedor.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Telefone</label>
              <input
                {...register('phone')}
                className="input-premium"
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800">
            <input
              type="checkbox"
              {...register('active')}
              className="w-4 h-4 text-primary-600 rounded border-gray-300 dark:border-gray-700 focus:ring-primary-500"
            />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fornecedor Ativo</label>
          </div>
        </div>
      </form>
    </Modal>
  );
}
  );
}
