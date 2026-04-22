import React from 'react';
import { DollarSign, Plus } from 'lucide-react';

interface CashbackSelectorProps {
  availableBalance: number;
  usedAmount: number;
  onUseCashback: (amount: number) => void;
  onRemoveCashback: () => void;
  maxUsable?: number;
}

export function CashbackSelector({ 
  availableBalance, 
  usedAmount, 
  onUseCashback, 
  onRemoveCashback,
  maxUsable 
}: CashbackSelectorProps) {
  const maxCashbackToUse = Math.min(availableBalance, maxUsable || Infinity);

  const handleUseMax = () => {
    onUseCashback(maxCashbackToUse);
  };

  const handleRemove = () => {
    onRemoveCashback();
  };

  if (usedAmount > 0) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-blue-600" />
            <span className="text-blue-800 font-medium">Cashback aplicado</span>
          </div>
          <button
            onClick={handleRemove}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            Remover
          </button>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-600">
            R$ {usedAmount.toFixed(2)}
          </div>
          <div className="text-sm text-blue-500">
            Saldo restante: R$ {(availableBalance - usedAmount).toFixed(2)}
          </div>
        </div>
      </div>
    );
  }

  if (availableBalance <= 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <DollarSign className="w-4 h-4" />
          <span className="text-sm">Você não possui cashback disponível</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-5 h-5 text-yellow-600" />
        <div>
          <h3 className="font-semibold text-yellow-800">Usar Cashback</h3>
          <p className="text-sm text-yellow-600">
            Saldo disponível: <span className="font-semibold">R$ {availableBalance.toFixed(2)}</span>
          </p>
        </div>
      </div>
      
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-yellow-700 mb-1">
            Valor a utilizar
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              max={maxCashbackToUse}
              step="0.01"
              onChange={(e) => onUseCashback(Number(e.target.value))}
              className="flex-1 px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
              placeholder="0,00"
            />
            <button
              onClick={handleUseMax}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Usar máximo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
