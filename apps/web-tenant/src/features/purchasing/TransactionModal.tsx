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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-primary-50/30">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Novo Lançamento</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Tipo</label>
              <select 
                {...register('type')}
                className="w-full bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none transition-all"
              >
                <option value={FinancialTransactionType.INCOME}>Entrada (+)</option>
                <option value={FinancialTransactionType.EXPENSE}>Saída (-)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Status</label>
              <select 
                {...register('status')}
                className="w-full bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none transition-all"
              >
                <option value={FinancialStatus.PAID}>Pago / Recebido</option>
                <option value={FinancialStatus.PENDING}>Pendente</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Valor (R$)</label>
            <div className="relative">
              <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input 
                type="number"
                step="0.01"
                {...register('amount', { required: true })}
                className="w-full bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl pl-10 pr-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                placeholder="0,00"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Conta</label>
            <select 
              {...register('accountId')}
              className="w-full bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none transition-all"
            >
              <option value="">Selecione uma conta...</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} (R$ {acc.balance.toLocaleString('pt-BR')})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Categoria</label>
            <input 
              {...register('category')}
              className="w-full bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none transition-all"
              placeholder="Ex: Aluguel, Venda, Suplementos..."
            />
          </div>

          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Descrição</label>
            <textarea 
              {...register('description')}
              className="w-full bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none transition-all min-h-[80px]"
              placeholder="Detalhes adicionais..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50 transition-all"
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
      </div>
    </div>
  );
}
