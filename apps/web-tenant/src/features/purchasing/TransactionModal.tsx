import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '../../lib/api-client';
import { 
  FinancialAccountDTO,
  FinancialTransactionType,
  FinancialStatus
} from '@gestor/types';
import { X, DollarSign, Loader2 } from 'lucide-react';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

import { Modal } from '../../components/Modal';

export function TransactionModal({ isOpen, onClose, onSave }: TransactionModalProps) {
  const [accounts, setAccounts] = useState<FinancialAccountDTO[]>([]);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<any>({
    defaultValues: {
      type: FinancialTransactionType.EXPENSE,
      status: FinancialStatus.PAID,
      paymentDate: new Date().toISOString().split('T')[0],
    }
  });

  useEffect(() => {
    if (isOpen) {
      loadAccounts();
    }
  }, [isOpen]);

  const loadAccounts = async () => {
    try {
      const res = await api.get<FinancialAccountDTO[]>('/finance/accounts');
      if (res.success) setAccounts(res.data);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
    }
  };

  const onSubmit = async (data: any) => {
    try {
      const res = await api.post('/finance/transactions', {
        ...data,
        amount: Number(data.amount),
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
      });

      if (res.success) {
        onSave();
        reset();
        onClose();
      }
    } catch (error) {
      console.error('Erro ao salvar transação:', error);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Lançamento"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Tipo</label>
            <select 
              {...register('type')}
              className="input-premium"
            >
              <option value={FinancialTransactionType.INCOME}>Entrada (+)</option>
              <option value={FinancialTransactionType.EXPENSE}>Saída (-)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Status</label>
            <select 
              {...register('status')}
              className="input-premium"
            >
              <option value={FinancialStatus.PAID}>Pago / Recebido</option>
              <option value={FinancialStatus.PENDING}>Pendente</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Valor (R$)</label>
          <div className="relative">
            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="number"
              step="0.01"
              {...register('amount', { required: true })}
              className="input-premium pl-10"
              placeholder="0,00"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Conta</label>
          <select 
            {...register('accountId')}
            className="input-premium"
          >
            <option value="">Selecione uma conta...</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name} (R$ {acc.balance.toLocaleString('pt-BR')})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Categoria</label>
          <input 
            {...register('category')}
            className="input-premium"
            placeholder="Ex: Aluguel, Venda, Suplementos..."
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Descrição</label>
          <textarea 
            {...register('description')}
            className="input-premium min-h-[80px]"
            placeholder="Detalhes adicionais..."
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-3 border border-gray-100 dark:border-gray-800 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50 transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
  );
}
