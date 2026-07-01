import { useState, useMemo, useEffect } from 'react';
import { X, Minus, Plus, ChevronRight, AlertCircle, Sparkles } from 'lucide-react';
import type {
  StorefrontProductPayload,
  StorefrontCategoryPayload,
  CartSelectedOptionGroup,
  StorefrontOptionItemPayload,
  PizzaCompositionDTO,
} from '@gestor/types';
import { api } from '../lib/api-client';
import { useCartStore } from '../store/use-cart-store';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProductDetailsModalProps {
  product: StorefrontProductPayload;
  category?: StorefrontCategoryPayload | null;
  isStoreClosed?: boolean;
  onClose: () => void;
}

type PizzaPreview = {
  sizeId: string;
  sizeName: string;
  flavors: Array<{
    productId: string;
    name: string;
    fraction: number;
    priceAtSize: number;
  }>;
  strategy: string;
  calculatedPrice: number;
};

export function ProductDetailsModal({ product, category, isStoreClosed, onClose }: ProductDetailsModalProps) {
  const addItem = useCartStore((s) => s.addItem);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [selections, setSelections] = useState<CartSelectedOptionGroup[]>([]);
  const [selectedSizeId, setSelectedSizeId] = useState('');
  const [selectedMountingItemId, setSelectedMountingItemId] = useState('');
  const [selectedPizzaFlavorIds, setSelectedPizzaFlavorIds] = useState<string[]>([]);
  const [pizzaPreview, setPizzaPreview] = useState<PizzaPreview | null>(null);
  const [pizzaPreviewLoading, setPizzaPreviewLoading] = useState(false);
  const [pizzaPreviewError, setPizzaPreviewError] = useState<string | null>(null);

  const isPizzaTemplate = category?.templateType === 'pizza';
  const isProductAvailable = product.isAvailable && !isStoreClosed;

  const sizeGroup = useMemo(() => {
    if (!isPizzaTemplate) return undefined;
    return (product.optionGroupLinks ?? []).find((link) =>
      link.optionGroup?.isActive && (
        link.pricingAxis === 'primary' ||
        link.optionGroup.name.includes('Tamanhos [Pizza]')
      )
    );
  }, [isPizzaTemplate, product.optionGroupLinks]);

  const mountingGroup = useMemo(() => {
    if (!isPizzaTemplate) return undefined;
    return (product.optionGroupLinks ?? []).find((link) =>
      link.optionGroup?.isActive && link.optionGroup.name.includes('Montagem [Pizza]')
    );
  }, [isPizzaTemplate, product.optionGroupLinks]);

  const pizzaSizeItems = sizeGroup?.optionGroup.items ?? [];
  const pizzaMountingItems = mountingGroup?.optionGroup.items ?? [];
  const pizzaFlavorOptions = useMemo(() => {
    if (!isPizzaTemplate) return [];
    return (category?.products ?? []).filter((p) => p.isAvailable && p.id !== product.id);
  }, [category?.products, isPizzaTemplate, product.id]);

  const genericOptionLinks = useMemo(() => {
    const links = (product.optionGroupLinks ?? []).filter((link) => link.optionGroup?.isActive);
    if (!isPizzaTemplate) return links;

    const ignored = new Set<string>();
    if (sizeGroup?.optionGroup.id) ignored.add(sizeGroup.optionGroup.id);
    if (mountingGroup?.optionGroup.id) ignored.add(mountingGroup.optionGroup.id);
    return links.filter((link) => !ignored.has(link.optionGroup.id));
  }, [isPizzaTemplate, mountingGroup?.optionGroup.id, product.optionGroupLinks, sizeGroup?.optionGroup.id]);

  const hasV2Options = genericOptionLinks.length > 0;

  useEffect(() => {
    setSelections(
      genericOptionLinks.map((link) => ({
        optionGroupId: link.optionGroup.id,
        name: link.overrideName || link.optionGroup.name,
        items: [],
      }))
    );

    if (!isPizzaTemplate) {
      setSelectedSizeId('');
      setSelectedMountingItemId('');
      setSelectedPizzaFlavorIds([]);
      setPizzaPreview(null);
      setPizzaPreviewError(null);
      return;
    }

    const firstSize = pizzaSizeItems[0]?.id ?? '';
    setSelectedSizeId((current) => (pizzaSizeItems.some((size) => size.id === current) ? current : firstSize));
    const preferredMounting =
      pizzaMountingItems.find((item) => (
        selectedPizzaFlavorIds.length > 1
          ? item.name.toLowerCase().includes('meio')
          : item.name.toLowerCase().includes('inteira')
      ))?.id ?? pizzaMountingItems[0]?.id ?? '';
    setSelectedMountingItemId((current) => (
      pizzaMountingItems.some((item) => item.id === current) ? current : preferredMounting
    ));
    setSelectedPizzaFlavorIds((current) => {
      const validIds = current.filter((id) => pizzaFlavorOptions.some((flavor) => flavor.id === id));
      if (validIds.length > 0) return validIds.slice(0, 2);
      return product.id ? [product.id] : [];
    });
  }, [genericOptionLinks, isPizzaTemplate, pizzaFlavorOptions, pizzaMountingItems, pizzaSizeItems, product.id, selectedPizzaFlavorIds.length]);

  useEffect(() => {
    if (!isPizzaTemplate || !category?.id || !selectedSizeId || selectedPizzaFlavorIds.length === 0) {
      setPizzaPreview(null);
      setPizzaPreviewError(null);
      setPizzaPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPizzaPreviewLoading(true);
    setPizzaPreviewError(null);

    api.post<PizzaPreview>('/catalog/pizza/simulate', {
      categoryId: category.id,
      sizeId: selectedSizeId,
      flavors: selectedPizzaFlavorIds.slice(0, 2).map((productId) => ({
        productId,
        fraction: selectedPizzaFlavorIds.length > 1 ? 0.5 : 1,
      })),
    })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setPizzaPreview(res.data);
        } else {
          setPizzaPreview(null);
          setPizzaPreviewError('Não foi possível simular o preço da pizza.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPizzaPreview(null);
        setPizzaPreviewError('Não foi possível simular o preço da pizza.');
      })
      .finally(() => {
        if (!cancelled) setPizzaPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [category?.id, isPizzaTemplate, selectedPizzaFlavorIds, selectedSizeId]);

  const pizzaComposition = useMemo<PizzaCompositionDTO | undefined>(() => {
    if (!isPizzaTemplate || !pizzaPreview) return undefined;
    return {
      sizeId: pizzaPreview.sizeId,
      sizeName: pizzaPreview.sizeName,
      pricingStrategy: pizzaPreview.strategy,
      calculatedPrice: pizzaPreview.calculatedPrice,
      flavors: pizzaPreview.flavors.map((flavor) => ({
        productId: flavor.productId,
        fraction: flavor.fraction,
        name: flavor.name,
      })),
    };
  }, [isPizzaTemplate, pizzaPreview]);

  const autoPizzaSelections = useMemo<CartSelectedOptionGroup[]>(() => {
    if (!isPizzaTemplate) return [];

    const mapped: CartSelectedOptionGroup[] = [];
    const sizeItem = pizzaSizeItems.find((item) => item.id === selectedSizeId);
    if (sizeGroup && sizeItem) {
      mapped.push({
        optionGroupId: sizeGroup.optionGroup.id,
        name: sizeGroup.overrideName || sizeGroup.optionGroup.name,
        items: [{
          optionItemId: sizeItem.id,
          name: sizeItem.name,
          priceImpactType: sizeItem.priceImpactType,
          priceImpactValue: sizeItem.priceImpactValue,
          qty: 1,
        }],
      });
    }

    const mountingItem = mountingGroup?.optionGroup.items.find((item) => item.id === selectedMountingItemId)
      ?? mountingGroup?.optionGroup.items.find((item) =>
        selectedPizzaFlavorIds.length > 1
          ? item.name.toLowerCase().includes('meio')
          : item.name.toLowerCase().includes('inteira')
      )
      ?? mountingGroup?.optionGroup.items[0];

    if (mountingGroup && mountingItem) {
      mapped.push({
        optionGroupId: mountingGroup.optionGroup.id,
        name: mountingGroup.overrideName || mountingGroup.optionGroup.name,
        items: [{
          optionItemId: mountingItem.id,
          name: mountingItem.name,
          priceImpactType: mountingItem.priceImpactType,
          priceImpactValue: mountingItem.priceImpactValue,
          qty: 1,
        }],
      });
    }

    return mapped;
  }, [isPizzaTemplate, mountingGroup, pizzaSizeItems, selectedMountingItemId, selectedPizzaFlavorIds.length, selectedSizeId, sizeGroup]);

  const computed = useMemo(() => {
    let extras = 0;
    const parts: string[] = [];

    selections.forEach((group) => {
      group.items.forEach((item) => {
        if (item.priceImpactType === 'fixed') {
          extras += item.priceImpactValue * (item.qty || 1);
        } else if (item.priceImpactType === 'percentage') {
          extras += (product.basePrice * (item.priceImpactValue / 100)) * (item.qty || 1);
        }
        parts.push(item.qty && item.qty > 1 ? `${item.name} x${item.qty}` : item.name);
      });
    });

    if (isPizzaTemplate) {
      const flavorNames = selectedPizzaFlavorIds
        .map((id) => pizzaFlavorOptions.find((flavor) => flavor.id === id)?.name)
        .filter((name): name is string => Boolean(name));
      const basePrice = pizzaPreview?.calculatedPrice ?? product.basePrice;

      return {
        unitPrice: basePrice + extras,
        totalPrice: (basePrice + extras) * quantity,
        compositionLabel: [
          pizzaPreview ? `Pizza ${pizzaPreview.sizeName}` : 'Pizza',
          flavorNames.join(' / '),
          ...parts,
        ].filter(Boolean).join('; '),
      };
    }

    return {
      unitPrice: product.basePrice + extras,
      totalPrice: (product.basePrice + extras) * quantity,
      compositionLabel: parts.join(', '),
    };
  }, [isPizzaTemplate, pizzaFlavorOptions, pizzaPreview, product.basePrice, quantity, selectedPizzaFlavorIds, selections]);

  const validationError = useMemo(() => {
    if (isPizzaTemplate) {
      if (!selectedSizeId) return 'Selecione um tamanho.';
      if (mountingGroup && !selectedMountingItemId) return 'Selecione a montagem da pizza.';
      if (selectedPizzaFlavorIds.length === 0) return 'Selecione pelo menos 1 sabor.';
      if (selectedPizzaFlavorIds.length > 2) return 'Selecione no máximo 2 sabores.';
      if (pizzaPreviewLoading) return 'Aguarde a simulação do preço.';
      if (pizzaPreviewError) return pizzaPreviewError;
    }

    for (const link of genericOptionLinks) {
      const group = link.optionGroup;
      const state = selections.find((s) => s.optionGroupId === group.id);
      const count = state?.items.length || 0;
      const min = link.overrideMinSelect ?? group.minSelect;
      const max = link.overrideMaxSelect ?? group.maxSelect;
      const name = link.overrideName || group.name;

      if (count < min) return `Selecione pelo menos ${min} em "${name}"`;
      if (count > max) return `Selecione no máximo ${max} em "${name}"`;
    }

    return null;
  }, [genericOptionLinks, isPizzaTemplate, mountingGroup, pizzaPreviewError, pizzaPreviewLoading, selectedMountingItemId, selectedPizzaFlavorIds.length, selectedSizeId, selections]);

  const toggleV2Option = (groupId: string, item: StorefrontOptionItemPayload, _minSelect: number, maxSelect: number, selectionType: string) => {
    setSelections((prev) => {
      const group = prev.find((g) => g.optionGroupId === groupId);
      if (!group) return prev;

      const isSelected = group.items.some((i) => i.optionItemId === item.id);
      let newItems = [...group.items];

      if (isSelected) {
        newItems = newItems.filter((i) => i.optionItemId !== item.id);
      } else {
        if (selectionType === 'single' || maxSelect === 1) {
          newItems = [{
            optionItemId: item.id,
            name: item.name,
            priceImpactType: item.priceImpactType,
            priceImpactValue: item.priceImpactValue,
            qty: 1,
          }];
        } else if (newItems.length < maxSelect) {
          newItems.push({
            optionItemId: item.id,
            name: item.name,
            priceImpactType: item.priceImpactType,
            priceImpactValue: item.priceImpactValue,
            qty: 1,
          });
        }
      }

      return prev.map((g) => (g.optionGroupId === groupId ? { ...g, items: newItems } : g));
    });
  };

  const updateV2Qty = (groupId: string, itemId: string, delta: number) => {
    setSelections((prev) => {
      const group = prev.find((g) => g.optionGroupId === groupId);
      if (!group) return prev;

      const newItems = group.items.map((i) => {
        if (i.optionItemId === itemId) {
          const newQty = Math.max(1, (i.qty || 1) + delta);
          return { ...i, qty: newQty };
        }
        return i;
      });

      return prev.map((g) => (g.optionGroupId === groupId ? { ...g, items: newItems } : g));
    });
  };

  const togglePizzaFlavor = (flavorId: string) => {
    setSelectedPizzaFlavorIds((prev) => {
      if (prev.includes(flavorId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== flavorId);
      }

      if (prev.length >= 2) return prev;
      return [...prev, flavorId];
    });
  };

  const toggleMounting = (itemId: string) => {
    setSelectedMountingItemId(itemId);
  };

  const handleAddToCart = () => {
    if (validationError || !isProductAvailable) return;

    addItem({
      product,
      quantity,
      notes: notes.trim() || undefined,
      selections: [...autoPizzaSelections, ...selections],
      pizzaComposition,
      computedUnitPrice: computed.unitPrice,
      compositionLabel: computed.compositionLabel,
    });

    onClose();
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
            {isPizzaTemplate ? (
              <div className="space-y-4">
                <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-foreground font-black text-sm uppercase tracking-wider">Pizza</div>
                      <div className="text-[10px] text-primary-700 font-bold italic">
                        Escolha 1 sabor ou 2 sabores meio a meio
                      </div>
                    </div>
                    <div className="text-[10px] font-black uppercase text-primary-700">
                      {selectedPizzaFlavorIds.length}/2
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-black text-gray-900 text-sm uppercase tracking-wider">Tamanho</div>
                      <div className="text-[10px] text-gray-400 font-bold">Selecione o tamanho da pizza</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {pizzaSizeItems.map((size) => {
                      const selected = selectedSizeId === size.id;
                      return (
                        <button
                          key={size.id}
                          type="button"
                          onClick={() => setSelectedSizeId(size.id)}
                          className={cn(
                            'px-3 py-3 rounded-xl border text-xs font-black transition-all',
                            selected
                              ? 'bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-100'
                              : 'bg-white border-gray-100 text-gray-700 hover:border-primary-200'
                          )}
                          aria-pressed={selected}
                        >
                          {size.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {mountingGroup ? (
                  <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-black text-gray-900 text-sm uppercase tracking-wider">Montagem</div>
                        <div className="text-[10px] text-gray-400 font-bold">Escolha como a pizza sera montada</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {pizzaMountingItems.map((item) => {
                        const selected = selectedMountingItemId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleMounting(item.id)}
                            className={cn(
                              'p-3 rounded-xl border text-left transition-all',
                              selected
                                ? 'bg-primary-50 border-primary-200 ring-1 ring-primary-200'
                                : 'bg-white border-gray-100 hover:border-gray-200'
                            )}
                            aria-pressed={selected}
                          >
                            <div className={cn('text-xs font-bold truncate', selected ? 'text-primary-900' : 'text-gray-700')}>
                              {item.name}
                            </div>
                            {item.description ? (
                              <div className="text-[10px] text-gray-400 font-bold mt-0.5 line-clamp-2">
                                {item.description}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-black text-gray-900 text-sm uppercase tracking-wider">Sabores</div>
                      <div className="text-[10px] text-gray-400 font-bold">Toque para escolher até 2 sabores</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[product, ...pizzaFlavorOptions].filter((flavor, index, list) => list.findIndex((item) => item.id === flavor.id) === index)
                      .map((flavor) => {
                        const selected = selectedPizzaFlavorIds.includes(flavor.id);
                        return (
                        <button
                          key={flavor.id}
                          type="button"
                          onClick={() => togglePizzaFlavor(flavor.id)}
                          className={cn(
                            'p-3 rounded-xl border text-left transition-all',
                            selected
                              ? 'bg-primary-50 border-primary-200 ring-1 ring-primary-200'
                              : 'bg-white border-gray-100 hover:border-gray-200'
                          )}
                          aria-pressed={selected}
                        >
                            <div className={cn('text-xs font-bold truncate', selected ? 'text-primary-900' : 'text-gray-700')}>
                              {flavor.name}
                            </div>
                            {selected && (
                              <div className="text-[10px] font-bold text-primary-700 mt-0.5">
                                {selectedPizzaFlavorIds.length === 2 ? '1/2 da pizza' : 'Sabor principal'}
                              </div>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Preço</div>
                      <div className="text-lg font-black text-gray-900">
                        {pizzaPreviewLoading ? 'Simulando...' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(computed.unitPrice)}
                      </div>
                    </div>
                    {pizzaPreview ? (
                      <div className="text-right">
                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Regra</div>
                        <div className="text-xs font-bold text-gray-700 capitalize">{pizzaPreview.strategy}</div>
                      </div>
                    ) : null}
                  </div>
                  {pizzaPreview ? (
                    <div className="mt-3 text-xs text-gray-500 leading-relaxed">
                      {pizzaPreview.sizeName} - {pizzaPreview.flavors.map((f) => f.name).join(' / ')}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasV2Options ? (
              <div className="space-y-5">
                {genericOptionLinks.map((link) => {
                  const group = link.optionGroup;
                  const min = link.overrideMinSelect ?? group.minSelect;
                  const max = link.overrideMaxSelect ?? group.maxSelect;
                  const state = selections.find((s) => s.optionGroupId === group.id);
                  const selectedIds = new Set((state?.items ?? []).map((item) => item.optionItemId));

                  return (
                    <div key={group.id} className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="text-gray-900 font-black text-sm uppercase tracking-wider">
                            {link.overrideName || group.name}
                          </div>
                          <div className="text-[10px] text-gray-400 font-bold">
                            {min > 0 ? `Obrigatório • ` : ''}
                            {max === 1 ? 'Escolha 1' : `Escolha até ${max}`}
                          </div>
                        </div>
                        <div className="text-[10px] font-black uppercase text-gray-400">
                          {(state?.items ?? []).length}/{max}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.items.filter((item) => item.isActive).map((item) => {
                          const isSelected = selectedIds.has(item.id);
                          const priceImpactValue = Number(item.priceImpactValue ?? 0);

                          return (
                            <div key={item.id} className="bg-white border border-gray-100 rounded-xl p-3">
                              <button
                                onClick={() => toggleV2Option(group.id, item, min, max, group.selectionType)}
                                className="w-full text-left"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-gray-900 font-bold text-xs truncate">{item.name}</div>
                                    <div className="text-[10px] text-gray-400 font-bold">
                                      {item.priceImpactType === 'fixed'
                                        ? `+ ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(priceImpactValue)}`
                                        : item.priceImpactType === 'percentage'
                                          ? `+ ${priceImpactValue}%`
                                          : item.priceImpactType === 'replace'
                                            ? `Preço: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(priceImpactValue)}`
                                            : ''}
                                    </div>
                                  </div>
                                  <div className={cn(
                                    'w-5 h-5 rounded-md border flex items-center justify-center',
                                    isSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 text-gray-400'
                                  )}>
                                    {isSelected ? <ChevronRight className="w-3.5 h-3.5 stroke-[3]" /> : null}
                                  </div>
                                </div>
                              </button>

                              {group.selectionType === 'quantity' && isSelected && item.allowQuantity ? (
                                <div className="mt-3 flex items-center gap-3">
                                  <button
                                    onClick={() => {
                                      const current = state?.items.find((x) => x.optionItemId === item.id)?.qty ?? 1;
                                      updateV2Qty(group.id, item.id, -1);
                                      if (current <= 1) return;
                                    }}
                                    className="w-8 h-8 rounded-xl bg-white border border-gray-100 text-gray-500 flex items-center justify-center"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <div className="text-gray-900 font-black">
                                    {state?.items.find((x) => x.optionItemId === item.id)?.qty ?? 1}
                                  </div>
                                  <button
                                    onClick={() => updateV2Qty(group.id, item.id, 1)}
                                    className="w-8 h-8 rounded-xl bg-white border border-gray-100 text-gray-500 flex items-center justify-center"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {pizzaPreviewError ? (
              <div className="bg-amber-50 border border-amber-100 text-amber-700 p-3 rounded-xl text-xs font-medium">
                {pizzaPreviewError}
              </div>
            ) : null}

            {product.upsells?.length > 0 ? (
              <div className="mt-8 space-y-4 pt-8 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary-600" />
                  <h3 className="font-black text-gray-900 text-sm uppercase tracking-tight">E que tal acompanhar com?</h3>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2">
                  {product.upsells.flatMap((u) => u.items.map((item) => (
                    <div key={`${u.id}-${item.productId}`} className="flex-shrink-0 w-36 bg-white border border-gray-100 rounded-2xl p-2.5 shadow-sm hover:shadow-md transition-all">
                      <div className="relative h-20 mb-2 rounded-xl overflow-hidden bg-gray-50">
                        {item.image ? <img src={item.image} className="w-full h-full object-cover" /> : null}
                      </div>
                      <h4 className="text-[10px] font-bold text-gray-900 line-clamp-1">{item.name}</h4>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[11px] font-black text-primary-600">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.finalPrice)}
                        </span>
                        <button
                          onClick={() => {
                            const virtualProduct: StorefrontProductPayload = {
                              id: item.productId,
                              name: item.name,
                              slug: `upsell-${item.productId}`,
                              basePrice: item.finalPrice,
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
                              notes: `Oferta: ${u.name}`,
                              sourceUpsellId: u.id,
                              computedUnitPrice: item.finalPrice,
                              compositionLabel: 'Oferta Especial',
                            });
                          }}
                          className="w-6 h-6 bg-primary-50 text-primary-600 border border-primary-100 rounded-full flex items-center justify-center"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )))}
                </div>
              </div>
            ) : null}

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
        </div>

        <div className="p-6 border-t bg-white sm:rounded-b-3xl">
          {validationError ? (
            <div className="mb-4 bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center gap-2 text-amber-700 text-xs font-medium animate-in fade-in zoom-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {validationError}
            </div>
          ) : null}

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-100 rounded-2xl p-1 h-12">
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700">
                <Minus className="w-5 h-5" />
              </button>
              <span className="w-8 text-center font-bold text-gray-900">{quantity}</span>
              <button onClick={() => setQuantity((q) => q + 1)} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700">
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={!!validationError || !isProductAvailable}
              className={cn(
                'flex-1 h-12 rounded-2xl flex items-center justify-between px-6 font-bold transition-all active:scale-[0.98]',
                (validationError || !isProductAvailable)
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-primary-600 text-white shadow-lg shadow-primary-100'
              )}
            >
              <span>{isStoreClosed ? 'Loja Fechada' : 'Adicionar'}</span>
              <span className="text-lg">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(computed.totalPrice)}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
