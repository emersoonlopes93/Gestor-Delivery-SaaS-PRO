import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Minus, Plus, AlertCircle, Sparkles, Check } from 'lucide-react';
import type {
  StorefrontProductPayload,
  StorefrontCategoryPayload,
  CartSelectedOptionGroup,
  StorefrontOptionItemPayload,
  PizzaCompositionDTO,
} from '@gestor/types';
import { resolveEffectiveSelectionRules } from '@gestor/types';
import {
  dedupeById,
  getPizzaFlavorSelectionLimit,
  isHalfAndHalfMounting,
  isPizzaCategory,
  normalizePizzaFlavorSelection,
  trimPizzaFlavorSelection,
} from '@gestor/utils';
import { api } from '../lib/api-client';
import { useCartStore } from '../store/use-cart-store';
import { useAnalytics } from '../features/analytics';
import { shouldUsePizzaFlow } from '../lib/pizza-flow';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { reconcileGenericSelections } from './product-details-selection';
import { getGenericOptionGroupError, getPizzaValidation } from './product-details-validation';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProductDetailsModalProps {
  product: StorefrontProductPayload;
  category?: StorefrontCategoryPayload | null;
  pizzaFlavorCandidates?: StorefrontProductPayload[];
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

const EMPTY_OPTION_ITEMS: StorefrontOptionItemPayload[] = [];

export function ProductDetailsModal({ product, category, pizzaFlavorCandidates, isStoreClosed, onClose }: ProductDetailsModalProps) {
  const analytics = useAnalytics();
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
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const optionGroupRefs = useRef(new Map<string, HTMLFieldSetElement>());
  const pizzaControlRefs = useRef(new Map<string, HTMLElement>());
  const onCloseRef = useRef(onClose);

  const optionGroupLinks = useMemo(() => product.optionGroupLinks ?? [], [product.optionGroupLinks]);
  const isProductAvailable = product.isAvailable && !isStoreClosed;
  const isPizzaTemplate = shouldUsePizzaFlow(category, optionGroupLinks);

  const sizeGroup = useMemo(() => {
    if (!isPizzaTemplate) return undefined;
    return optionGroupLinks.find((link) =>
      link.optionGroup?.isActive && (
        link.pricingAxis === 'primary' ||
        /tamanh/i.test(link.optionGroup.name)
      )
    );
  }, [isPizzaTemplate, optionGroupLinks]);

  const mountingGroup = useMemo(() => {
    if (!isPizzaTemplate) return undefined;
    return optionGroupLinks.find((link) =>
      link.optionGroup?.isActive && /montagem|montage/i.test(link.optionGroup.name)
    );
  }, [isPizzaTemplate, optionGroupLinks]);

  const pizzaSizeItems = sizeGroup?.optionGroup.items ?? EMPTY_OPTION_ITEMS;
  const pizzaMountingItems = mountingGroup?.optionGroup.items ?? EMPTY_OPTION_ITEMS;
  const isHalfAndHalf = isHalfAndHalfMounting(selectedMountingItemId, pizzaMountingItems);
  const flavorSelectionLimit = getPizzaFlavorSelectionLimit(selectedMountingItemId, pizzaMountingItems);
  const pizzaFlavorOptions = useMemo(() => {
    if (!isPizzaTemplate || !isPizzaCategory(category)) return [];
    const source = pizzaFlavorCandidates?.length ? pizzaFlavorCandidates : (category?.products ?? []);
    return dedupeById(source.filter((p) => p.isAvailable && p.id !== product.id));
  }, [category, isPizzaTemplate, pizzaFlavorCandidates, product.id]);

  const genericOptionLinks = useMemo(() => {
    const links = optionGroupLinks.filter((link) => link.optionGroup?.isActive);
    if (!isPizzaTemplate) return links;

    const ignored = new Set<string>();
    if (sizeGroup?.optionGroup.id) ignored.add(sizeGroup.optionGroup.id);
    if (mountingGroup?.optionGroup.id) ignored.add(mountingGroup.optionGroup.id);
    return links.filter((link) => !ignored.has(link.optionGroup.id));
  }, [isPizzaTemplate, mountingGroup?.optionGroup.id, optionGroupLinks, sizeGroup?.optionGroup.id]);

  const hasV2Options = genericOptionLinks.length > 0;
  const genericOptionLinksRef = useRef(genericOptionLinks);

  useEffect(() => {
    genericOptionLinksRef.current = genericOptionLinks;
  }, [genericOptionLinks]);

  useEffect(() => {
    setSelections(
      genericOptionLinksRef.current.map((link) => ({
        optionGroupId: link.optionGroup.id,
        name: link.overrideName || link.optionGroup.name,
        items: [],
      }))
    );

    setSelectedSizeId('');
    setSelectedMountingItemId('');
    setSelectedPizzaFlavorIds([]);
    setPizzaPreview(null);
    setPizzaPreviewError(null);
  }, [product.id]);

  useEffect(() => {
    setHasAttemptedSubmit(false);
  }, [product.id]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('[data-initial-focus]')?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('hidden'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    setSelections((current) => reconcileGenericSelections(genericOptionLinks, current));
  }, [genericOptionLinks]);

  useEffect(() => {
    if (!isPizzaTemplate) return;
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
  }, [isPizzaTemplate, pizzaFlavorOptions, pizzaMountingItems, pizzaSizeItems, product.id, selectedPizzaFlavorIds.length]);

  useEffect(() => {
    if (!isPizzaTemplate) return;

    setSelectedPizzaFlavorIds((current) => {
      const validIds = current.filter((id) => pizzaFlavorOptions.some((flavor) => flavor.id === id));
      return trimPizzaFlavorSelection(validIds, flavorSelectionLimit, product.id);
    });
  }, [flavorSelectionLimit, isPizzaTemplate, pizzaFlavorOptions, product.id]);

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

  const pizzaValidation = useMemo(() => isPizzaTemplate ? getPizzaValidation({
    hasMountingGroup: Boolean(mountingGroup),
    selectedSizeId,
    selectedMountingItemId,
    selectedFlavorCount: selectedPizzaFlavorIds.length,
    flavorSelectionLimit,
    isPreviewLoading: pizzaPreviewLoading,
    previewError: pizzaPreviewError,
  }) : null, [flavorSelectionLimit, isPizzaTemplate, mountingGroup, pizzaPreviewError, pizzaPreviewLoading, selectedMountingItemId, selectedPizzaFlavorIds.length, selectedSizeId]);

  const validationError = useMemo(() => {
    if (pizzaValidation) return pizzaValidation.message;
    if (isPizzaTemplate) {
      if (!selectedSizeId) return 'Selecione um tamanho.';
      if (mountingGroup && !selectedMountingItemId) return 'Selecione a montagem da pizza.';
      if (selectedPizzaFlavorIds.length === 0) return 'Selecione pelo menos 1 sabor.';
      if (selectedPizzaFlavorIds.length > flavorSelectionLimit) return `Selecione no máximo ${flavorSelectionLimit} sabor${flavorSelectionLimit > 1 ? 'es' : ''}.`;
      if (pizzaPreviewLoading) return 'Aguarde a simulação do preço.';
      if (pizzaPreviewError) return pizzaPreviewError;
    }

    for (const link of genericOptionLinks) {
      const groupError = getGenericOptionGroupError(link, selections);
      if (groupError) return groupError;

      const group = link.optionGroup;
      const state = selections.find((s) => s.optionGroupId === group.id);
      const count = state?.items.length || 0;
      const { effectiveMinSelect: min, effectiveMaxSelect: max } = resolveEffectiveSelectionRules({
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        overrideIsRequired: link.overrideIsRequired,
        overrideMinSelect: link.overrideMinSelect,
        overrideMaxSelect: link.overrideMaxSelect,
      });
      const name = link.overrideName || group.name;

      if (count < min) return `Selecione pelo menos ${min} em "${name}"`;
      if (count > max) return `Selecione no máximo ${max} em "${name}"`;
    }

    return null;
  }, [flavorSelectionLimit, genericOptionLinks, isPizzaTemplate, mountingGroup, pizzaPreviewError, pizzaPreviewLoading, pizzaValidation, selectedMountingItemId, selectedPizzaFlavorIds.length, selectedSizeId, selections]);

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
      return normalizePizzaFlavorSelection(prev, flavorId, flavorSelectionLimit);
    });
  };

  const toggleMounting = (itemId: string) => {
    setSelectedMountingItemId(itemId);
    const nextLimit = getPizzaFlavorSelectionLimit(itemId, pizzaMountingItems);
    setSelectedPizzaFlavorIds((current) => trimPizzaFlavorSelection(current, nextLimit, product.id));
  };

  const handleAddToCart = () => {
    if (!isProductAvailable) return;
    if (validationError) {
      setHasAttemptedSubmit(true);
      const invalidGroup = genericOptionLinks.find((link) => getGenericOptionGroupError(link, selections));
      const target = invalidGroup
        ? optionGroupRefs.current.get(invalidGroup.optionGroup.id)
        : pizzaValidation
          ? pizzaControlRefs.current.get(pizzaValidation.target)
          : undefined;
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => target.focus(), 250);
      } else {
        contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    addItem({
      product,
      quantity,
      notes: notes.trim() || undefined,
      selections: [...autoPizzaSelections, ...selections],
      pizzaComposition,
      computedUnitPrice: computed.unitPrice,
      compositionLabel: computed.compositionLabel,
    });
    analytics.track('add_to_cart', {
      productId: product.id,
      quantity,
      unitPrice: computed.unitPrice,
      value: computed.totalPrice,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/65 p-0 sm:items-center sm:p-6" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-details-title"
        className="flex max-h-[94dvh] w-full max-w-[44rem] flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-[2rem]"
      >
        <div className="relative">
          {product.image ? (
            <img src={product.image} alt={product.name} className="h-36 w-full object-cover sm:h-52 sm:rounded-t-[2rem]" />
          ) : (
            <div className="h-20 w-full bg-primary-50 sm:rounded-t-[2rem]" />
          )}
          <button
            type="button"
            onClick={onClose}
            data-initial-focus
            aria-label="Fechar detalhes do produto"
            className="absolute right-3 top-3 rounded-full bg-black/45 p-2.5 text-white shadow-sm transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7 sm:py-6">
          <header className="mb-6 border-b border-slate-100 pb-5">
            <h2 id="product-details-title" className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{product.name}</h2>
            <p className="text-gray-500 mt-2 leading-relaxed text-sm">
              {product.shortDescription || 'Sem detalhes adicionais.'}
            </p>
            {!isPizzaTemplate ? (
              <p className="mt-3 text-sm font-black text-primary-700">
                A partir de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.basePrice)}
              </p>
            ) : null}
          </header>

          {isStoreClosed ? (
            <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Você pode montar seu pedido agora. A finalização estará disponível assim que a loja abrir.
            </div>
          ) : !product.isAvailable ? (
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
                        {isHalfAndHalf ? 'Escolha até 2 sabores meio a meio' : 'Escolha 1 sabor para a pizza inteira'}
                      </div>
                    </div>
                    <div className="text-[10px] font-black uppercase text-primary-700">
                      {selectedPizzaFlavorIds.length}/{flavorSelectionLimit}
                    </div>
                  </div>
                </div>

                <div ref={(element) => { if (element) pizzaControlRefs.current.set('pizza-size', element); }} tabIndex={-1} className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
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
                  {hasAttemptedSubmit && pizzaValidation?.target === 'pizza-size' ? (
                    <p role="alert" className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800"><AlertCircle className="h-4 w-4" />{pizzaValidation.message}</p>
                  ) : null}
                </div>

                {mountingGroup ? (
                  <div ref={(element) => { if (element) pizzaControlRefs.current.set('pizza-mounting', element); }} tabIndex={-1} className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
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
                    {hasAttemptedSubmit && pizzaValidation?.target === 'pizza-mounting' ? (
                      <p role="alert" className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800"><AlertCircle className="h-4 w-4" />{pizzaValidation.message}</p>
                    ) : null}
                  </div>
                ) : null}

                <div ref={(element) => { if (element) pizzaControlRefs.current.set('pizza-flavors', element); }} tabIndex={-1} className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-black text-gray-900 text-sm uppercase tracking-wider">Sabores</div>
                      <div className="text-[10px] text-gray-400 font-bold">
                        {isHalfAndHalf ? 'Toque para escolher até 2 sabores' : 'Toque para escolher 1 sabor'}
                      </div>
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
                  {hasAttemptedSubmit && pizzaValidation?.target === 'pizza-flavors' ? (
                    <p role="alert" className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800"><AlertCircle className="h-4 w-4" />{pizzaValidation.message}</p>
                  ) : null}
                </div>

                <div ref={(element) => { if (element) pizzaControlRefs.current.set('pizza-price', element); }} tabIndex={-1} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
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
                  {hasAttemptedSubmit && pizzaValidation?.target === 'pizza-price' ? (
                    <p role="alert" className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800"><AlertCircle className="h-4 w-4" />{pizzaValidation.message}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasV2Options ? (
              <div className="space-y-5">
                {genericOptionLinks.map((link) => {
                  const group = link.optionGroup;
                  const rules = resolveEffectiveSelectionRules({
                    selectionType: group.selectionType,
                    isRequired: group.isRequired,
                    minSelect: group.minSelect,
                    maxSelect: group.maxSelect,
                    overrideIsRequired: link.overrideIsRequired,
                    overrideMinSelect: link.overrideMinSelect,
                    overrideMaxSelect: link.overrideMaxSelect,
                  });
                  const min = rules.effectiveMinSelect;
                  const max = rules.effectiveMaxSelect;
                  const state = selections.find((s) => s.optionGroupId === group.id);
                  const selectedIds = new Set((state?.items ?? []).map((item) => item.optionItemId));

                  return (
                    <fieldset
                      key={group.id}
                      ref={(element) => {
                        if (element) optionGroupRefs.current.set(group.id, element);
                        else optionGroupRefs.current.delete(group.id);
                      }}
                      tabIndex={-1}
                      aria-label={link.overrideName || group.name}
                      aria-describedby={hasAttemptedSubmit && getGenericOptionGroupError(link, selections) ? `option-group-error-${group.id}` : undefined}
                      className={cn(
                        'rounded-2xl border bg-slate-50/80 p-4 transition-colors sm:p-5',
                        hasAttemptedSubmit && getGenericOptionGroupError(link, selections) ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-100',
                      )}
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="text-gray-900 font-black text-sm uppercase tracking-wider">
                            {link.overrideName || group.name}
                          </div>
                          <div className="text-[10px] text-gray-400 font-bold">
                            {rules.effectiveIsRequired ? `Obrigatório • ` : ''}
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
                            <div key={item.id} className={cn(
                              'overflow-hidden rounded-xl border transition-colors',
                              isSelected ? 'border-primary-500 bg-primary-50 shadow-sm' : 'border-gray-200 bg-white hover:border-primary-300',
                            )}>
                              <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 p-3 text-left focus-within:outline focus-within:outline-2 focus-within:outline-primary-500">
                                <input
                                  type={group.selectionType === 'single' || max === 1 ? 'radio' : 'checkbox'}
                                  name={`option-group-${group.id}`}
                                  checked={isSelected}
                                  onChange={() => toggleV2Option(group.id, item, min, max, group.selectionType)}
                                  className="sr-only"
                                />
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
                                    'w-5 h-5 border flex items-center justify-center',
                                    group.selectionType === 'single' || max === 1 ? 'rounded-full' : 'rounded-md',
                                    isSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 text-gray-400'
                                  )}>
                                    {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : null}
                                  </div>
                                </div>
                              </label>

                              {group.selectionType === 'quantity' && isSelected && item.allowQuantity ? (
                                <div className="mt-3 flex items-center gap-3">
                                  <button
                                    type="button"
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
                                    type="button"
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
                      {hasAttemptedSubmit && getGenericOptionGroupError(link, selections) ? (
                        <p id={`option-group-error-${group.id}`} role="alert" className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          {getGenericOptionGroupError(link, selections)}
                        </p>
                      ) : null}
                    </fieldset>
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
                          type="button"
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

        <div className="border-t bg-white px-4 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.06)] sm:rounded-b-[2rem] sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 items-center rounded-xl bg-slate-100 p-1">
              <button type="button" aria-label="Diminuir quantidade" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">
                <Minus className="w-5 h-5" />
              </button>
              <span className="w-7 text-center font-bold text-slate-900">{quantity}</span>
              <button type="button" aria-label="Aumentar quantidade" onClick={() => setQuantity((q) => q + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500">
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!isProductAvailable}
              className={cn(
                'flex h-11 flex-1 items-center justify-between rounded-xl px-4 font-bold transition-all active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
                !isProductAvailable
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-primary-600 text-white shadow-lg shadow-primary-100'
              )}
            >
              <span>{isStoreClosed ? 'Finalização indisponível' : 'Adicionar'}</span>
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
