import { useState, useMemo } from 'react';
import { X, Minus, Plus, ChevronRight, AlertCircle } from 'lucide-react';
import { StorefrontProductPayload, CartSelectedComplement } from '@gestor/types';
import { CartValidator } from '@gestor/core';
import { useCartStore } from '../store/use-cart-store';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProductDetailsModalProps {
  product: StorefrontProductPayload;
  onClose: () => void;
}

export function ProductDetailsModal({ product, onClose }: ProductDetailsModalProps) {
  const addItem = useCartStore(s => s.addItem);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<CartSelectedComplement[]>([]);
  const [notes, setNotes] = useState('');

  // Calculate current subtotal for the modal view
  const currentPrice = useMemo(() => {
    const extras = selectedOptions.reduce((sum, opt) => sum + opt.price, 0);
    return (product.basePrice + extras) * quantity;
  }, [product.basePrice, selectedOptions, quantity]);

  // Validation Logic
  const validationError = useMemo(() => {
    try {
      CartValidator.validateProductComplements(product, selectedOptions);
      return null;
    } catch (e: any) {
      return e.message;
    }
  }, [product, selectedOptions]);

  const toggleOption = (groupId: string, itemId: string, name: string, price: number, maxSelect: number) => {
    setSelectedOptions(prev => {
      const alreadySelected = prev.find(o => o.itemId === itemId);
      const groupSelections = prev.filter(o => o.groupId === groupId);

      if (alreadySelected) {
        return prev.filter(o => o.itemId !== itemId);
      }

      // If maxSelect is 1, replace other selections in the same group
      if (maxSelect === 1) {
        return [...prev.filter(o => o.groupId !== groupId), { groupId, itemId, name, price }];
      }

      // If we reached max, don't add more
      if (groupSelections.length >= maxSelect) {
        return prev;
      }

      return [...prev, { groupId, itemId, name, price }];
    });
  };

  const handleAddToCart = () => {
    if (validationError) return;
    addItem(product, quantity, selectedOptions, notes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      {/* Container */}
      <div className="bg-white w-full max-w-lg sm:rounded-3xl flex flex-col max-h-[92vh] shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-300">
        
        {/* Header */}
        <div className="relative">
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-full h-48 sm:h-64 object-cover sm:rounded-t-3xl" />
          ) : (
            <div className="w-full h-24 bg-primary-50 sm:rounded-t-3xl" />
          )}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
          <header className="mb-6">
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{product.name}</h2>
            <p className="text-gray-500 mt-2 leading-relaxed text-sm">
              {product.shortDescription || 'Sem detalhes adicionais.'}
            </p>
            {product.longDescription && (
              <p className="text-gray-400 mt-4 text-xs italic">{product.longDescription}</p>
            )}
          </header>

          {/* Complements Sections */}
          <div className="space-y-8">
            {product.complements.map((group) => (
              <div key={group.id} className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">{group.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {group.minSelect > 0 ? `Obrigatório • ` : ''} 
                      {group.maxSelect === 1 ? 'Escolha 1' : `Escolha até ${group.maxSelect}`}
                    </p>
                  </div>
                  {group.isRequired && !selectedOptions.some(o => o.groupId === group.id) && (
                    <span className="bg-primary-100 text-primary-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase">Obrigatório</span>
                  )}
                </div>

                <div className="space-y-2">
                  {group.items.map((item) => {
                    const isSelected = selectedOptions.some(o => o.itemId === item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleOption(group.id, item.id, item.name, item.additionalPrice, group.maxSelect)}
                        disabled={!item.isAvailable}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                          isSelected 
                            ? "bg-primary-50 border-primary-200 ring-1 ring-primary-200" 
                            : "bg-white border-gray-100 hover:border-gray-200",
                          !item.isAvailable && "opacity-50 grayscale cursor-not-allowed"
                        )}
                      >
                        <div className="flex-1">
                          <span className={cn("text-sm font-bold", isSelected ? "text-primary-900" : "text-gray-700")}>
                            {item.name}
                          </span>
                          {item.description && <p className="text-[10px] text-gray-400 mt-0.5">{item.description}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                          {item.additionalPrice > 0 && (
                            <span className="text-xs font-black text-primary-600">
                              + {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.additionalPrice)}
                            </span>
                          )}
                          <div className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center transition-colors",
                            isSelected ? "bg-primary-600 border-primary-600 text-white" : "bg-white border-gray-200"
                          )}>
                            {isSelected && <ChevronRight className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Observations */}
          <div className="mt-8">
            <h3 className="font-bold text-gray-900 text-sm uppercase mb-3">Observações</h3>
            <textarea
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-gray-300 min-h-[100px]"
              placeholder="Algum comentário? Ex: sem cebola, ponto da carne..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-white sm:rounded-b-3xl">
          {validationError && (
            <div className="mb-4 bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-2 text-amber-700 text-xs font-medium animate-in fade-in zoom-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {validationError}
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-100 rounded-2xl p-1 h-12">
              <button 
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Minus className="w-5 h-5" />
              </button>
              <span className="w-8 text-center font-bold text-gray-900">{quantity}</span>
              <button 
                onClick={() => setQuantity(q => q + 1)}
                className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
                >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={!!validationError}
              className={cn(
                "flex-1 h-12 rounded-2xl flex items-center justify-between px-6 font-bold transition-all active:scale-[0.98]",
                validationError 
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed" 
                  : "bg-primary-600 text-white shadow-lg shadow-primary-100 hover:bg-primary-700"
              )}
            >
              <span>Adicionar</span>
              <span className="text-lg">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentPrice)}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
