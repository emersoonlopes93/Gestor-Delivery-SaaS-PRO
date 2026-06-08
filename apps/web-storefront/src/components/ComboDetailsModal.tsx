import { useState, useMemo, useEffect } from 'react';
import { X, Minus, Plus, AlertCircle, Box, Check } from 'lucide-react';
import type { 
  CartSelectedComboSlot,
  StorefrontComboPayload,
  StorefrontProductPayload,
  StorefrontComboBlockItemPayload
} from '@gestor/types';
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
  const addItem = useCartStore(s => s.addItem);
  const isBundle = (combo.comboMode ?? 'bundle') === 'bundle';
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  // V2 State
  const [slots, setSlots] = useState<CartSelectedComboSlot[]>([]);

  useEffect(() => {
    if (!isBundle && combo.blocks) {
    const initial: CartSelectedComboSlot[] = combo.blocks.map(b => ({
      blockId: b.id,
      productId: '',
      items: []
    }));
    setSlots(initial);
    }
  }, [combo, isBundle]);

  const isComboAvailable = combo.isAvailable && !isStoreClosed;

  // Calculate current subtotal for the modal view
  const computed = useMemo(() => {
    let extras = 0;
    const parts: string[] = [];

    if (isBundle) {
      (combo.bundleItems ?? []).forEach(i => parts.push(`${i.productName} x${i.qty}`));
    } else {
      slots.forEach(slot => {
        slot.items?.forEach(item => {
          extras += item.additionalPrice * (item.qty || 1);
          parts.push(item.qty && item.qty > 1 ? `${item.name} x${item.qty}` : item.name);
        });
      });
    }

    return {
      unitPrice: combo.basePrice + extras,
      totalPrice: (combo.basePrice + extras) * quantity,
      compositionLabel: parts.join(', ')
    };
  }, [combo, isBundle, slots, quantity]);

  // Validation Logic
  const validationError = useMemo(() => {
    if (isBundle) return null;

    for (const block of combo.blocks || []) {
      const state = slots.find(s => s.comboSlotId === block.id || s.blockId === block.id);
      const count = state?.items?.length || 0;
      if (count < block.minSelect) return `Selecione pelo menos ${block.minSelect} em "${block.name}"`;
      if (count > block.maxSelect) return `Selecione no máximo ${block.maxSelect} em "${block.name}"`;
    }

    return null;
  }, [combo, slots, isBundle]);

  const toggleSlotItem = (blockId: string, item: StorefrontComboBlockItemPayload, maxSelect: number) => {
    setSlots(prev => {
      const slot = prev.find(s => s.comboSlotId === blockId || s.blockId === blockId);
      if (!slot) return prev;

      const isSelected = slot.items?.some(i => i.productId === item.productId);
      let newItems = [...(slot.items || [])];

      if (isSelected) {
        newItems = newItems.filter(i => i.productId !== item.productId);
      } else {
        if (maxSelect === 1) {
          newItems = [{ productId: item.productId, name: item.productName, additionalPrice: item.additionalPrice, qty: 1 }];
        } else if (newItems.length < maxSelect) {
          newItems.push({ productId: item.productId, name: item.productName, additionalPrice: item.additionalPrice, qty: 1 });
        }
      }

      return prev.map(s => (s.comboSlotId === blockId || s.blockId === blockId) ? { ...s, items: newItems } : s);
    });
  };

  const handleAddToCart = () => {
    if (validationError) return;
    if (!isComboAvailable) return;

    // Map StorefrontComboPayload to StorefrontProductPayload for addItem
    const comboAsProduct: StorefrontProductPayload = {
      id: combo.id,
      name: combo.name,
      slug: combo.slug,
      type: 'combo',
      shortDescription: combo.description || '',
      basePrice: combo.basePrice,
      image: combo.image || '',
      isAvailable: combo.isAvailable,
      optionGroupLinks: [],
      complementGroups: [],
      upsellLinks: [],
      upsells: [],
    };

    addItem({
      product: comboAsProduct,
      quantity,
      notes: notes.trim() || undefined,
      slots: !isBundle ? slots : undefined,
      bundleItems: isBundle ? combo.bundleItems.map(bi => ({ ...bi, name: bi.productName })) : undefined,
      computedUnitPrice: computed.unitPrice,
      compositionLabel: computed.compositionLabel
    });
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-storefront-card w-full max-w-lg sm:rounded-3xl flex flex-col max-h-[92vh] shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-300">
        
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
            <h2 className="text-2xl font-black text-storefront-muted-foreground900 uppercase tracking-tight">{combo.name}</h2>
            <p className="text-storefront-muted-foreground500 mt-2 leading-relaxed text-sm italic">
              {combo.description || 'Escolha seus itens favoritos neste combo.'}
            </p>
          </header>

          {!combo.isAvailable ? (
            <div className="mb-6 bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-2 text-red-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Indisponível no momento.
            </div>
          ) : null}

          <div className="space-y-8">
            {isBundle ? (
              <div className="bg-orange-50/30 rounded-2xl p-4 border border-orange-100/50">
                <h3 className="font-bold text-storefront-muted-foreground900 text-sm uppercase tracking-wider mb-3">Itens do Combo</h3>
                <div className="space-y-2">
                  {(combo.bundleItems ?? []).map((item) => (
                    <div key={item.id} className="w-full flex items-center justify-between p-3 rounded-xl border bg-storefront-card border-storefront-border100">
                      <span className="text-sm font-bold text-storefront-muted-foreground700">{item.productName}</span>
                      <span className="text-xs font-black text-orange-600">
                        {item.qty}x {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (combo.blocks ?? []).map((block) => {
              const state = slots.find(s => s.comboSlotId === block.id || s.blockId === block.id);
              const selectedCount = state?.items?.length || 0;

              return (
                <div key={block.id} className="bg-orange-50/30 rounded-2xl p-4 border border-orange-100/50">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-storefront-muted-foreground900 text-sm uppercase tracking-wider">{block.name}</h3>
                      <p className="text-[10px] text-orange-600 font-medium mt-0.5">
                        {block.minSelect === block.maxSelect 
                          ? `Escolha exatamente ${block.minSelect}` 
                          : `Escolha de ${block.minSelect} a ${block.maxSelect}`}
                      </p>
                    </div>
                    {block.minSelect > 0 && selectedCount < block.minSelect && (
                      <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase">Obrigatório</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {block.items.map((item) => {
                      const isSelected = state?.items.some(i => i.productId === item.productId);
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleSlotItem(block.id, item, block.maxSelect)}
                          className={cn(
                            "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                            isSelected 
                              ? "bg-storefront-card border-orange-200 ring-2 ring-orange-200/50" 
                              : "bg-storefront-card border-storefront-border100 hover:border-orange-100"
                          )}
                        >
                          <div className="flex-1">
                            <span className={cn("text-sm font-bold", isSelected ? "text-orange-900" : "text-storefront-muted-foreground700")}>
                              {item.productName}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {item.additionalPrice > 0 && (
                              <span className="text-xs font-black text-orange-600">
                                + R$ {item.additionalPrice.toFixed(2)}
                              </span>
                            )}
                            <div className={cn(
                              "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                              isSelected ? "bg-orange-600 border-orange-600 text-white" : "bg-storefront-card border-storefront-border200"
                            )}>
                              {isSelected && <Check className="w-3 h-3 stroke-[4]" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8">
            <h3 className="font-bold text-storefront-muted-foreground900 text-sm uppercase mb-3">Observações do Combo</h3>
            <textarea
              className="w-full bg-storefront-muted50 border border-storefront-border100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-orange-500 outline-none min-h-[80px]"
              placeholder="Ex: sem catchup..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="p-6 border-t bg-storefront-card sm:rounded-b-3xl">
          {validationError && (
            <div className="mb-4 bg-orange-50 border border-orange-100 p-3 rounded-xl flex items-center gap-2 text-orange-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {validationError}
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-storefront-muted100 rounded-2xl p-1 h-12">
              <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-10 h-10 flex items-center justify-center text-storefront-muted-foreground500 hover:text-storefront-muted-foreground700">
                <Minus className="w-5 h-5" />
              </button>
              <span className="w-8 text-center font-bold text-storefront-muted-foreground900">{quantity}</span>
              <button onClick={() => setQuantity(q => q + 1)} className="w-10 h-10 flex items-center justify-center text-storefront-muted-foreground500 hover:text-storefront-muted-foreground700">
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={!!validationError || !isComboAvailable}
              className={cn(
                "flex-1 h-12 rounded-2xl flex items-center justify-between px-6 font-bold transition-all active:scale-[0.98]",
                (validationError || !isComboAvailable) ? "bg-storefront-muted200 text-storefront-muted-foreground400 cursor-not-allowed" : "bg-orange-600 text-white shadow-lg shadow-orange-100"
              )}
            >
              <span>{isStoreClosed ? 'Loja Fechada' : 'Adicionar Combo'}</span>
              <span className="text-lg">R$ {computed.totalPrice.toFixed(2)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
