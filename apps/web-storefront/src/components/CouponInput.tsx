import React, { useState } from 'react';
import { Search, X } from 'lucide-react';

interface CouponInputProps {
  onApplyCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
  appliedCoupon?: string;
  isLoading?: boolean;
  error?: string;
}

export function CouponInput({ 
  onApplyCoupon, 
  onRemoveCoupon, 
  appliedCoupon, 
  isLoading = false,
  error 
}: CouponInputProps) {
  const [couponCode, setCouponCode] = useState('');

  const handleApply = () => {
    if (couponCode.trim()) {
      onApplyCoupon(couponCode.trim().toUpperCase());
    }
  };

  const handleRemove = () => {
    setCouponCode('');
    onRemoveCoupon();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApply();
    }
  };

  if (appliedCoupon) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-green-800 font-medium">Cupom aplicado</span>
          <span className="text-green-600 font-mono">{appliedCoupon}</span>
        </div>
        <button
          onClick={handleRemove}
          className="text-green-600 hover:text-green-800 p-1"
          title="Remover cupom"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Código do Cupom
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Digite seu cupom"
          className={`w-full pl-10 pr-20 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            error 
              ? 'border-red-300 text-red-900 placeholder-red-300' 
              : 'border-gray-300 text-gray-900 placeholder-gray-400'
          }`}
          disabled={isLoading}
        />
        <button
          onClick={handleApply}
          disabled={!couponCode.trim() || isLoading}
          className="absolute inset-y-0 right-0 px-4 bg-blue-600 text-white rounded-r-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            'Aplicar'
          )}
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 mt-1">{error}</p>
      )}
    </div>
  );
}
