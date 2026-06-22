import { useState } from 'react';
import { Modal } from '@/components/Modal';

export type AdjustmentType = 'cashback' | 'wallet' | 'loyalty';
export type AdjustmentOperation = 'add' | 'remove';

interface BalanceAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number, description: string) => Promise<void>;
  type: AdjustmentType;
  operation: AdjustmentOperation;
  customerName: string;
}

export function BalanceAdjustmentModal({ isOpen, onClose, onConfirm, type, operation, customerName }: BalanceAdjustmentModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const labels = {
    cashback: { unit: 'R$', title: 'Cashback' },
    wallet: { unit: 'R$', title: 'Saldo na Carteira' },
    loyalty: { unit: 'Pontos', title: 'Pontos de Fidelidade' },
  };

  const currentLabel = labels[type];
  const isAdd = operation === 'add';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    try {
      setIsSubmitting(true);
      await onConfirm(Number(amount), description);
      setAmount('');
      setDescription('');
      onClose();
    } catch (err) {
      console.error(err);
      alert('Erro ao processar o ajuste.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isAdd ? 'Adicionar' : 'Remover'} ${currentLabel.title}`}
      maxWidth="max-w-md"
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
            type="submit"
            form="adjustmentForm"
            disabled={isSubmitting}
            className={`px-6 py-2 text-white text-sm font-bold rounded-xl shadow-lg transition-colors ${
              isAdd 
                ? 'bg-green-600 hover:bg-green-700 shadow-green-900/20' 
                : 'bg-red-600 hover:bg-red-700 shadow-red-900/20'
            } disabled:opacity-50`}
          >
            {isSubmitting ? 'Processando...' : 'Confirmar Ajuste'}
          </button>
        </>
      }
    >
      <form id="adjustmentForm" onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-muted/50 p-4 rounded-xl border border-border">
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-1">Cliente Alvo</p>
          <p className="text-sm font-black text-foreground">{customerName}</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">
            Valor ({currentLabel.unit})
          </label>
          <input
            type="number"
            step={type === 'loyalty' ? "1" : "0.01"}
            required
            min="0.01"
            className="input-premium"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Ex: ${type === 'loyalty' ? '100' : '50.00'}`}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">
            Motivo / Descrição (Opcional)
          </label>
          <input
            type="text"
            className="input-premium"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Bônus de aniversário"
          />
        </div>
      </form>
    </Modal>
  );
}
