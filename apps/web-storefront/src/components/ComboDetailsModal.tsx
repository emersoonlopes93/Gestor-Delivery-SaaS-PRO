import { useState, useMemo } from 'react';
import { X, Minus, Plus, AlertCircle, Box, Check } from 'lucide-react';
import type { StorefrontComboPayload, CartSelectedComboItem, CartBundleItemSnapshot } from '@gestor/types';
import { CartValidator } from '@gestor/core';
import { useCartStore } from '../store/use-cart-store';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ComboDetailsModalProps {
  combo: StorefrontComboPayload;
  isStoreClosed?: boolean;
  onClose: () => void;
}

export function ComboDetailsModal({ combo, isStoreClosed, onClose }: ComboDetailsModalProps) {
  const addCombo = useCartStore(s => s.addCombo);
  const isBundle = (combo.comboMode ?? 'bundle') === 'bundle';
  const [quantity, setQuantity] = useState(1);
  const [selectedItems, setSelectedItems] = useState<CartSelectedComboItem[]>([]);
  const [bundleItems] = useState<CartBundleItemSnapshot[]>(combo.bundleItems ?? []);
  const [notes, setNotes] = useState('');

  // Calculate current subtotal for the modal view
  const currentPrice = useMemo(() => {
    const extras = selectedItems.reduce((sum, item) => sum + item.price, 0);
    return (combo.basePrice + extras) * quantity;
  }, [combo.basePrice, selectedItems, quantity]);

  // Validation Logic
  const validationError = useMemo(() => {
    if (isBundle) return null;
    try {
      CartValidator.validateComboItems(combo, selectedItems);
      return null;
    } catch (e: any) {
      return e.message;
    }
  }, [combo, selectedItems]);

  const toggleItem = (blockId: string, blockItemId: string, productId: string, productName: string, price: number, maxSelect: number) => {
    setSelectedItems(prev => {
      const alreadySelected = prev.find(i => i.blockItemId === blockItemId);
      if (alreadySelected) {
        return prev.filter(i => i.blockItemId !== blockItemId);
      }

      const blockSelections = prev.filter(i => i.blockId === blockId);
      const newItem: CartSelectedComboItem = { blockId, blockItemId, productId, productName, price };

      if (maxSelect === 1) {
        return [...prev.filter(i => i.blockId !== blockId), newItem];
      }

      if (blockSelections.length >= maxSelect) {
        return prev;
      }

      return [...prev, newItem];
    });
  };

  const handleAddToCart = () => {
    if (validationError) return;
    addCombo(combo, quantity, selectedItems, bundleItems, notes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg sm:rounded-3xl flex flex-col max-h-[92vh] shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-300">
        
        <div className="relative">
          {combo.image ? (
            <img src={combo.image} alt={combo.name} className="w-full h-48 sm:h-64 object-cover sm:rounded-t-3xl" />
          ) : (
            <div className="w-full h-32 bg-orange-50 sm:rounded-t-3xl flex items-center justify-center">
               <Box className="w-12 h-12 text-orange-200" />
            </div>
          )}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
          <header className="mb-6">
            <div className="flex items-center gap-2 mb-1">
               <span className="bg-orange-100 text-orange-700 text-[10px] font-black px-2 py-0.5 rounded uppercase">Combo</span>
            </div>
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{combo.name}</h2>
            <p className="text-gray-500 mt-2 leading-relaxed text-sm italic">
              {combo.description || 'Escolha seus itens favoritos neste combo.'}
            </p>
          </header>

          <div className="space-y-8">
            {isBundle ? (
              <div className="bg-orange-50/30 rounded-2xl p-4 border border-orange-100/50">
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider mb-3">Itens do Combo</h3>
                <div className="space-y-2">
                  {(combo.bundleItems ?? []).map((item) => (
                    <div key={item.id} className="w-full flex items-center justify-between p-3 rounded-xl border bg-white border-gray-100">
                      <span className="text-sm font-bold text-gray-700">{item.productName}</span>
                      <span className="text-xs font-black text-orange-600">
                        {item.qty}x {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 rounded-xl bg-white border border-orange-100 text-xs text-gray-600">
                  <div className="flex justify-between"><span>Subtotal dos itens</span><span className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(combo.itemsSubtotal ?? 0)}</span></div>
                  <div className="flex justify-between"><span>Desconto do combo</span><span className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(combo.discountTotal ?? 0)}</span></div>
                  <div className="flex justify-between text-sm text-gray-900 mt-1"><span className="font-bold">Preço final</span><span className="font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(combo.basePrice)}</span></div>
                </div>
              </div>
            ) : (combo.blocks ?? []).map((block) => (
              <div key={block.id} className="bg-orange-50/30 rounded-2xl p-4 border border-orange-100/50">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">{block.name}</h3>
                    <p className="text-[10px] text-orange-600 font-medium mt-0.5">
                      {block.minSelect === block.maxSelect 
                         ? `Escolha exatamente ${block.minSelect}` 
                         : `Escolha de ${block.minSelect} a ${block.maxSelect}`}
                    </p>
                  </div>
                  {block.minSelect > 0 && !selectedItems.some(i => i.blockId === block.id) && (
                    <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase">Obrigatório</span>
                  )}
                </div>

                <div className="space-y-2">
                  {block.items.map((item) => {
                    const isSelected = selectedItems.some(i => i.blockItemId === item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleItem(block.id, item.id, item.productId, item.productName, item.additionalPrice, block.maxSelect)}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                          isSelected 
                            ? "bg-white border-orange-200 ring-2 ring-orange-200/50" 
                            : "bg-white/50 border-gray-100 hover:border-orange-100"
                        )}
                      >
                        <div className="flex-1">
                          <span className={cn("text-sm font-bold", isSelected ? "text-orange-900" : "text-gray-700")}>
                            {item.productName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {item.additionalPrice > 0 && (
                            <span className="text-xs font-black text-orange-600">
                              + {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.additionalPrice)}
                            </span>
                          )}
                          <div className={cn(
                            "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                            isSelected ? "bg-orange-600 border-orange-600 text-white" : "bg-white border-gray-200"
                          )}>
                            {isSelected && <Check className="w-3 h-3 stroke-[4]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <h3 className="font-bold text-gray-900 text-sm uppercase mb-3">Observações do Combo</h3>
            <textarea
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all placeholder:text-gray-300 min-h-[80px]"
              placeholder="Ex: Mandar talheres, sem catchup..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="p-6 border-t bg-white sm:rounded-b-3xl">
          {validationError && (
            <div className="mb-4 bg-orange-50 border border-orange-100 p-3 rounded-xl flex items-center gap-2 text-orange-700 text-xs font-medium">
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
              disabled={!!validationError || isStoreClosed}
              className={cn(
                "flex-1 h-12 rounded-2xl flex items-center justify-between px-6 font-bold transition-all active:scale-[0.98]",
                (validationError || isStoreClosed)
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed" 
                  : "bg-orange-600 text-white shadow-lg shadow-orange-100 hover:bg-orange-700"
              )}
            >
              <span>{isStoreClosed ? 'Loja Fechada' : 'Adicionar Combo'}</span>
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
