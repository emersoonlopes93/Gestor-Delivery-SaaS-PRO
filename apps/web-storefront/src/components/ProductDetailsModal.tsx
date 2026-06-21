import { useState, useMemo, useEffect } from 'react';
import { X, Minus, Plus, ChevronRight, AlertCircle, Sparkles } from 'lucide-react';
import { 
  StorefrontProductPayload, 
  StorefrontUpsellPayload, 
  StorefrontUpsellItemPayload,
  CartSelectedOptionGroup,
  StorefrontOptionItemPayload
} from '@gestor/types';

import { useCartStore } from '../store/use-cart-store';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProductDetailsModalProps {
  product: StorefrontProductPayload;
  isStoreClosed?: boolean;
  onClose: () => void;
}

export function ProductDetailsModal({ product, isStoreClosed, onClose }: ProductDetailsModalProps) {
  const addItem = useCartStore(s => s.addItem);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');


  
  // V2 State
  const [selections, setSelections] = useState<CartSelectedOptionGroup[]>([]);

  useEffect(() => {
    if (product.optionGroupLinks?.length > 0) {
      const initial = product.optionGroupLinks
        .filter(l => l.optionGroup?.isActive)
        .map(l => ({
          optionGroupId: l.optionGroup.id,
          name: l.overrideName || l.optionGroup.name,
          items: []
        }));
      setSelections(initial);
    }
  }, [product]);

  const isProductAvailable = product.isAvailable && !isStoreClosed;


  const hasV2Options = product.optionGroupLinks?.length > 0;

  // Pricing V2 Logic
  const computed = useMemo(() => {
    let extras = 0;
    const parts: string[] = [];



    // V2 logic
    if (hasV2Options) {
      selections.forEach(group => {
        group.items.forEach(item => {
          if (item.priceImpactType === 'fixed') {
            extras += item.priceImpactValue * (item.qty || 1);
          } else if (item.priceImpactType === 'percentage') {
            extras += (product.basePrice * (item.priceImpactValue / 100)) * (item.qty || 1);
          }
          parts.push(item.qty && item.qty > 1 ? `${item.name} x${item.qty}` : item.name);
        });
      });
    }

    return {
      unitPrice: product.basePrice + extras,
      totalPrice: (product.basePrice + extras) * quantity,
      compositionLabel: parts.join(', ')
    };
  }, [product, selections, quantity, hasV2Options]);

  // Validation Logic
  const validationError = useMemo(() => {


    // V2 Validation
    if (hasV2Options) {
      for (const link of product.optionGroupLinks) {
        const group = link.optionGroup;
        if (!group.isActive) continue;

        const state = selections.find(s => s.optionGroupId === group.id);
        const count = state?.items.length || 0;
        const min = link.overrideMinSelect ?? group.minSelect;
        const max = link.overrideMaxSelect ?? group.maxSelect;
        const name = link.overrideName || group.name;

        if (count < min) return `Selecione pelo menos ${min} em "${name}"`;
        if (count > max) return `Selecione no máximo ${max} em "${name}"`;
      }
    }

    return null;
  }, [product, selections, hasV2Options]);



  const toggleV2Option = (groupId: string, item: StorefrontOptionItemPayload, _minSelect: number, maxSelect: number, selectionType: string) => {
    setSelections(prev => {
      const group = prev.find(g => g.optionGroupId === groupId);
      if (!group) return prev;

      const isSelected = group.items.some(i => i.optionItemId === item.id);
      let newItems = [...group.items];

      if (isSelected) {
        newItems = newItems.filter(i => i.optionItemId !== item.id);
      } else {
        if (selectionType === 'single' || maxSelect === 1) {
          newItems = [{ 
            optionItemId: item.id, 
            name: item.name, 
            priceImpactType: item.priceImpactType, 
            priceImpactValue: item.priceImpactValue,
            qty: 1 
          }];
        } else if (newItems.length < maxSelect) {
          newItems.push({ 
            optionItemId: item.id, 
            name: item.name, 
            priceImpactType: item.priceImpactType, 
            priceImpactValue: item.priceImpactValue,
            qty: 1 
          });
        }
      }

      return prev.map(g => g.optionGroupId === groupId ? { ...g, items: newItems } : g);
    });
  };

  const updateV2Qty = (groupId: string, itemId: string, delta: number, _maxSelect: number) => {
    setSelections(prev => {
      const group = prev.find(g => g.optionGroupId === groupId);
      if (!group) return prev;

      const newItems = group.items.map(i => {
        if (i.optionItemId === itemId) {
          const newQty = Math.max(1, (i.qty || 1) + delta);
          return { ...i, qty: newQty };
        }
        return i;
      });

      return prev.map(g => g.optionGroupId === groupId ? { ...g, items: newItems } : g);
    });
  };

  const handleAddToCart = () => {
    if (validationError) return;
    if (!isProductAvailable) return;

    addItem({
      product,
      quantity,
      notes: notes.trim() || undefined,
      selections: hasV2Options ? selections : undefined,
      computedUnitPrice: computed.unitPrice,
      compositionLabel: computed.compositionLabel,
    });
    
    onClose();
  };

  const addUpsellItem = (upsell: StorefrontUpsellPayload, item: StorefrontUpsellItemPayload) => {
    const virtualProduct: StorefrontProductPayload = {
      id: item.productId,
      name: item.name,
      slug: `upsell-${item.productId}`,
      basePrice: Number(item.finalPrice ?? item.originalPrice ?? 0),
      image: item.image || '',
      type: 'simple',
      isAvailable: true,
      badges: [],
      optionGroupLinks: [],
      complementGroups: [],
      upsellLinks: [],
      upsells: [],
    };
    
    addItem({
      product: virtualProduct,
      quantity: 1,
      notes: `Oferta: ${upsell.name}`,
      sourceUpsellId: upsell.id,
      computedUnitPrice: Number(item.finalPrice ?? item.originalPrice ?? 0),
      compositionLabel: 'Oferta Especial'
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg sm:rounded-3xl flex flex-col max-h-[85vh] sm:max-h-[92vh] shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-300">
        
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

        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
          <header className="mb-6">
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{product.name}</h2>
            <p className="text-gray-500 mt-2 leading-relaxed text-sm">
              {product.shortDescription || 'Sem detalhes adicionais.'}
            </p>
          </header>

          {!product.isAvailable ? (
            <div className="mb-6 bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-2 text-red-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Indisponível no momento.
            </div>
          ) : null}

          <div className="space-y-8">
            {/* V2 Options Rendering */}
            {hasV2Options && product.optionGroupLinks.filter(l => l.optionGroup?.isActive).map((link) => {
              const group = link.optionGroup;
              const min = link.overrideMinSelect ?? group.minSelect;
              const max = link.overrideMaxSelect ?? group.maxSelect;
              const state = selections.find(s => s.optionGroupId === group.id);
              const selectedCount = state?.items.length || 0;

              return (
                <div key={link.id} className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">
                        {link.overrideName || group.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {min > 0 ? `Obrigatório • ` : ''} 
                        {max === 1 ? 'Escolha 1' : `Escolha até ${max}`}
                      </p>
                    </div>
                    {min > 0 && selectedCount < min && (
                      <span className="bg-primary-100 text-primary-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase">Obrigatório</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {group.items.filter(i => i.isActive).map((item) => {
                      const selection = state?.items.find(i => i.optionItemId === item.id);
                      const isSelected = !!selection;
                      
                      return (
                        <div key={item.id} className="space-y-2">
                          <button
                            onClick={() => toggleV2Option(group.id, item, min, max, group.selectionType)}
                            className={cn(
                              "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                              isSelected 
                                ? "bg-primary-50 border-primary-200 ring-1 ring-primary-200" 
                                : "bg-white border-gray-100 hover:border-gray-200"
                            )}
                          >
                            <div className="flex-1">
                              <span className={cn("text-sm font-bold", isSelected ? "text-primary-900" : "text-gray-700")}>
                                {item.name}
                              </span>
                              {item.description && <p className="text-[10px] text-gray-400 mt-0.5">{item.description}</p>}
                            </div>
                            <div className="flex items-center gap-3">
                              {item.priceImpactValue > 0 && (
                                <span className="text-xs font-black text-primary-600">
                                  + {item.priceImpactType === 'percentage' ? `${item.priceImpactValue}%` : `R$ ${item.priceImpactValue.toFixed(2)}`}
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

                          {isSelected && item.allowQuantity && group.selectionType === 'quantity' && (
                            <div className="flex items-center gap-3 pl-2">
                              <div className="flex items-center bg-white border border-gray-100 rounded-xl p-1 h-9 shadow-sm">
                                <button 
                                  onClick={() => updateV2Qty(group.id, item.id, -1, max)}
                                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-primary-600"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-6 text-center text-xs font-bold text-gray-700">{selection.qty || 1}</span>
                                <button 
                                  onClick={() => updateV2Qty(group.id, item.id, 1, max)}
                                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-primary-600"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}


          </div>

          {/* Upsells */}
          {product.upsells?.length > 0 && (
            <div className="mt-8 space-y-4 pt-8 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">E que tal acompanhar com?</h3>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2">
                {product.upsells.flatMap(u => u.items.map(item => (
                  <div key={`${u.id}-${item.productId}`} className="flex-shrink-0 w-36 bg-white border border-gray-100 rounded-2xl p-2.5 shadow-sm hover:shadow-md transition-all">
                    <div className="relative h-20 mb-2 rounded-xl overflow-hidden bg-gray-50">
                      {item.image && <img src={item.image} className="w-full h-full object-cover" />}
                    </div>
                    <h4 className="text-[10px] font-bold text-gray-900 line-clamp-1">{item.name}</h4>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] font-black text-primary-600">R${item.finalPrice.toFixed(2)}</span>
                      <button onClick={() => addUpsellItem(u, item)} className="w-6 h-6 bg-primary-50 text-primary-600 border border-primary-100 rounded-full flex items-center justify-center">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )))}
              </div>
            </div>
          )}

          <div className="mt-8">
            <h3 className="font-bold text-gray-900 text-sm uppercase mb-3">Observações</h3>
            <textarea
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary-500 outline-none min-h-[100px]"
              placeholder="Ex: sem cebola, ponto da carne..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="p-6 border-t bg-white sm:rounded-b-3xl">
          {validationError && (
            <div className="mb-4 bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-2 text-amber-700 text-xs font-medium animate-in fade-in zoom-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {validationError}
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-100 rounded-2xl p-1 h-12">
              <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700">
                <Minus className="w-5 h-5" />
              </button>
              <span className="w-8 text-center font-bold text-gray-900">{quantity}</span>
              <button onClick={() => setQuantity(q => q + 1)} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700">
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={!!validationError || !isProductAvailable}
              className={cn(
                "flex-1 h-12 rounded-2xl flex items-center justify-between px-6 font-bold transition-all active:scale-[0.98]",
                (validationError || !isProductAvailable) ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-primary-600 text-white shadow-lg shadow-primary-100"
              )}
            >
              <span>{isStoreClosed ? 'Loja Fechada' : 'Adicionar'}</span>
              <span className="text-lg">R$ {computed.totalPrice.toFixed(2)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
