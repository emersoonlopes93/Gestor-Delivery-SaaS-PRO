import { useEffect, useMemo, useState, useCallback } from 'react';
import { X, Minus, Plus, AlertCircle, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import {
  dedupeById,
  getPizzaFlavorSelectionLimit,
  isHalfAndHalfMounting,
  isPizzaCategory,
  normalizePizzaFlavorSelection,
  trimPizzaFlavorSelection,
} from '@gestor/utils';
import type {
  CreateOrderItemSelectionGroupDTO,
  CreateOrderItemComboSlotSelectionDTO,
  PizzaCompositionDTO,
} from '@gestor/types';

type PricingAxis = 'primary' | 'secondary';
type PriceImpactType = 'none' | 'fixed' | 'replace' | 'percentage';

type ProductDetail = {
  id: string;
  name: string;
  type: 'simple' | 'configurable' | 'combo';
  basePrice: number;
  image?: string | null;
  isActive?: boolean;
  isAvailable?: boolean;
  category?: { id: string; templateType?: string | null; templateConfig?: unknown } | null;
  optionGroupLinks?: Array<{
    id: string;
    pricingAxis?: PricingAxis;
    overrideName?: string | null;
    overrideDescription?: string | null;
    overrideIsRequired?: boolean | null;
    overrideMinSelect?: number | null;
    overrideMaxSelect?: number | null;
    optionGroup: {
      id: string;
      name: string;
      description?: string | null;
      selectionType: 'single' | 'multiple' | 'quantity';
      isRequired: boolean;
      minSelect: number;
      maxSelect: number;
      isActive: boolean;
      items: Array<{
        id: string;
        name: string;
        description?: string | null;
        isActive: boolean;
        allowQuantity: boolean;
        priceImpactType: PriceImpactType;
        priceImpactValue: number;
      }>;
    };
  }>;
  comboMode?: 'bundle' | 'slot' | null;
  comboSlots?: Array<{
    id: string;
    name: string;
    description?: string | null;
    isRequired: boolean;
    minSelect: number;
    maxSelect: number;
    allowedItems: Array<{
      id: string;
      productId: string;
      additionalPrice: number;
      product?: {
        id: string;
        name: string;
        basePrice: number;
        isActive: boolean;
        deletedAt?: string | null;
      } | null;
    }>;
  }>;
};


type SelectionState = Array<{ optionGroupId: string; items: Array<{ optionItemId: string; qty?: number }> }>;

type SlotState = Array<{ comboSlotId: string; items: Array<{ productId: string; qty?: number }> }>;

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildSelectionsDto(input: SelectionState): CreateOrderItemSelectionGroupDTO[] {
  return input
    .map((g) => ({
      optionGroupId: g.optionGroupId,
      items: g.items.map((i) => ({ optionItemId: i.optionItemId, qty: i.qty })),
    }))
    .filter((g) => g.items.length > 0);
}

function buildSlotsDto(input: SlotState): CreateOrderItemComboSlotSelectionDTO[] {
  return input
    .map((s) => ({
      comboSlotId: s.comboSlotId,
      items: s.items.map((i) => ({ productId: i.productId, qty: i.qty })),
    }))
    .filter((s) => s.items.length > 0);
}

function computeOptionSelectionsPrice(detail: ProductDetail, selections: SelectionState): { unitPrice: number; composition: string } {
  const basePrice = Number(detail.basePrice ?? 0);
  const links = (detail.optionGroupLinks ?? []).filter((l) => {
    if (!l.optionGroup?.isActive) return false;
    if (detail.category?.templateType === 'pizza') {
      const groupName = l.optionGroup.name ?? '';
      if (l.pricingAxis === 'primary' || /tamanh|montage/i.test(groupName)) {
        return false;
      }
    }
    return true;
  });

  const groupLinkMap = new Map<string, (typeof links)[number]>();
  for (const link of links) {
    groupLinkMap.set(link.optionGroup.id, link);
  }

  for (const sel of selections) {
    if (!groupLinkMap.has(sel.optionGroupId)) {
      throw new Error('Grupo de opções não reconhecido para este produto.');
    }
  }

  for (const [groupId, link] of groupLinkMap.entries()) {
    const group = link.optionGroup;
    const selectedGroup = selections.find((s) => s.optionGroupId === groupId);
    const selectedCount = selectedGroup ? selectedGroup.items.length : 0;

    const minSelect = link.overrideMinSelect ?? group.minSelect;
    const maxSelect = link.overrideMaxSelect ?? group.maxSelect;
    const isRequired = link.overrideIsRequired ?? group.isRequired;
    const groupName = link.overrideName ?? group.name;

    const effectiveMin = isRequired ? Math.max(1, Number(minSelect ?? 0)) : Number(minSelect ?? 0);

    if (selectedCount < effectiveMin) {
      throw new Error(`Selecione pelo menos ${effectiveMin} opções em "${groupName}".`);
    }
    if (selectedCount > Number(maxSelect ?? 0)) {
      throw new Error(`Máximo de ${maxSelect} opções em "${groupName}".`);
    }
  }

  let effectiveBasePrice = basePrice;
  let fixedTotal = 0;
  let percentageTotal = 0;
  let hasReplace = false;

  const compositionParts: string[] = [];

  for (const selGroup of selections) {
    const link = groupLinkMap.get(selGroup.optionGroupId);
    if (!link) continue;

    const group = link.optionGroup;
    const groupName = link.overrideName ?? group.name;
    const pricingAxis = (link.pricingAxis ?? 'secondary') as PricingAxis;

    const groupItems = group.items;
    const chosenNames: string[] = [];

    for (const chosen of selGroup.items) {
      const itemRecord = groupItems.find((i) => i.id === chosen.optionItemId);
      if (!itemRecord) throw new Error(`Opção não encontrada em "${groupName}".`);
      if (!itemRecord.isActive) throw new Error(`A opção "${itemRecord.name}" não está disponível.`);

      const allowQuantity = Boolean(itemRecord.allowQuantity);
      const qty = allowQuantity ? Math.max(1, Number(chosen.qty ?? 1)) : 1;

      const impactType = itemRecord.priceImpactType;
      const impactValue = Number(itemRecord.priceImpactValue ?? 0);

      if (impactType === 'replace') {
        if (pricingAxis !== 'primary') {
          throw new Error(`Substituição de preço não permitida fora do eixo principal em "${groupName}".`);
        }
        if (hasReplace) {
          throw new Error('Mais de uma opção de substituição de preço selecionada.');
        }
        hasReplace = true;
        effectiveBasePrice = impactValue;
      } else if (impactType === 'fixed') {
        fixedTotal += impactValue * qty;
      } else if (impactType === 'percentage') {
        percentageTotal += effectiveBasePrice * (impactValue / 100) * qty;
      }

      chosenNames.push(allowQuantity && qty > 1 ? `${itemRecord.name} x${qty}` : itemRecord.name);
    }

    if (chosenNames.length > 0) compositionParts.push(`${groupName}: ${chosenNames.join(', ')}`);
  }

  const unitPrice = Number((effectiveBasePrice + fixedTotal + percentageTotal).toFixed(2));
  return { unitPrice, composition: compositionParts.join('; ') };
}

export function PosItemConfiguratorModal(props: {
  isOpen: boolean;
  productId: string;
  onClose: () => void;
  onConfirm: (result: {
    productId: string;
    name: string;
    lineType: 'product' | 'combo';
    quantity: number;
    notes?: string;
    selections?: CreateOrderItemSelectionGroupDTO[];
    pizzaComposition?: PizzaCompositionDTO;
    slots?: CreateOrderItemComboSlotSelectionDTO[];
    computedUnitPrice: number;
    compositionLabel: string;
  }) => void;
}) {
  const { isOpen, productId, onClose, onConfirm } = props;

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [selectionState, setSelectionState] = useState<SelectionState>([]);
  const [slotState, setSlotState] = useState<SlotState>([]);

  // Pizza Template State
  const [categoryFlavors, setCategoryFlavors] = useState<ProductDetail[]>([]);
  const [selectedPizzaFlavors, setSelectedPizzaFlavors] = useState<Array<{ productId: string; name: string }>>([]);
  const [pizzaSizeId, setPizzaSizeId] = useState('');
  const [selectedPizzaMountingItemId, setSelectedPizzaMountingItemId] = useState('');
  const [pizzaPreview, setPizzaPreview] = useState<{ unitPrice: number; label: string } | null>(null);
  const [pizzaPreviewMeta, setPizzaPreviewMeta] = useState<{ sizeName: string; strategy: string; calculatedPrice: number } | null>(null);
  const [pizzaPreviewLoading, setPizzaPreviewLoading] = useState(false);
  const [pizzaPreviewError, setPizzaPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setDetail(null);
    setQuantity(1);
    setNotes('');
    setError(null);
    setSelectionState([]);
    setSlotState([]);

    api
      .get<ProductDetail>(`/catalog/products/${productId}`)
      .then((res) => {
        if (!res.success) throw new Error('Erro ao carregar produto.');
        const data = res.data;
        setDetail(data);

        // Initial selections
        const initialSelections: SelectionState = (data.optionGroupLinks ?? [])
          .filter((l) => l.optionGroup?.isActive)
          .filter((l) => !data.category || data.category.templateType !== 'pizza' || !/tamanh|montagem/i.test(l.optionGroup.name))
          .map((l) => ({ optionGroupId: l.optionGroup.id, items: [] }));
        setSelectionState(initialSelections);

        const initialSlots: SlotState = (data.comboSlots ?? []).map((s) => ({ comboSlotId: s.id, items: [] }));
        setSlotState(initialSlots);

        // If Pizza, fetch other flavors in same category
        const category = data.category;
        if (isPizzaCategory(category) && category?.id) {
          setSelectedPizzaFlavors([{ productId: data.id, name: data.name }]);
          api.get<ProductDetail[]>(`/catalog/products?categoryId=${category.id}`).then(catRes => {
            if (catRes.success) {
              setCategoryFlavors(
                catRes.data.filter(
                  (item) =>
                    item.category?.id === category.id &&
                    item.isActive !== false &&
                    item.isAvailable !== false,
                ),
              );
            }
          });
          const sizeLink = (data.optionGroupLinks ?? []).find((link) => link.pricingAxis === 'primary' || /tamanh/i.test(link.optionGroup.name));
          const mountingLink = (data.optionGroupLinks ?? []).find((link) => /montagem|montage/i.test(link.optionGroup.name));
          setPizzaSizeId(sizeLink?.optionGroup.items[0]?.id ?? '');
          setSelectedPizzaMountingItemId(mountingLink?.optionGroup.items[0]?.id ?? '');
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Erro ao carregar produto.');
      })
      .finally(() => setLoading(false));
  }, [isOpen, productId]);

  const isPizzaTemplate = detail?.category?.templateType === 'pizza';
  const isCombo = detail?.type === 'combo';
  const isSlotCombo = isCombo && (detail?.comboMode ?? 'bundle') === 'slot';

  const pizzaSizeGroup = useMemo(
    () => detail?.optionGroupLinks?.find((link) => link.pricingAxis === 'primary' || link.optionGroup.name.includes('Tamanhos [Pizza]')),
    [detail?.optionGroupLinks],
  );

  const pizzaMountingGroup = useMemo(
    () => detail?.optionGroupLinks?.find((link) => /montagem|montage/i.test(link.optionGroup.name)),
    [detail?.optionGroupLinks],
  );

  const pizzaSizeItems = pizzaSizeGroup?.optionGroup.items ?? [];
  const pizzaMountingItems = pizzaMountingGroup?.optionGroup.items ?? [];
  const flavorSelectionLimit = getPizzaFlavorSelectionLimit(selectedPizzaMountingItemId, pizzaMountingItems);

  const genericOptionLinks = useMemo(() => {
    const links = (detail?.optionGroupLinks ?? []).filter((l) => l.optionGroup?.isActive);
    if (!isPizzaTemplate) return links;

    const ignoredGroupIds = new Set<string>();
    if (pizzaSizeGroup?.optionGroup.id) ignoredGroupIds.add(pizzaSizeGroup.optionGroup.id);
    if (pizzaMountingGroup?.optionGroup.id) ignoredGroupIds.add(pizzaMountingGroup.optionGroup.id);
    return links.filter((link) => !ignoredGroupIds.has(link.optionGroup.id));
  }, [detail?.optionGroupLinks, isPizzaTemplate, pizzaMountingGroup?.optionGroup.id, pizzaSizeGroup?.optionGroup.id]);

  const genericOptionDetail = useMemo(() => {
    if (!detail) return null;
    return {
      ...detail,
      optionGroupLinks: genericOptionLinks,
    };
  }, [detail, genericOptionLinks]);

  const hasV2Options = genericOptionLinks.length > 0;
  const isHalfAndHalf = isHalfAndHalfMounting(selectedPizzaMountingItemId, pizzaMountingItems);
  const pizzaFlavorCatalog = useMemo(
    () => dedupeById([detail, ...categoryFlavors].filter((item): item is ProductDetail => Boolean(item))),
    [categoryFlavors, detail],
  );

  useEffect(() => {
    if (!isPizzaTemplate) return;

    setSelectedPizzaFlavors((current) => {
      const currentIds = current
        .map((flavor) => flavor.productId)
        .filter((id) => pizzaFlavorCatalog.some((flavor) => flavor.id === id));
      const nextIds = trimPizzaFlavorSelection(currentIds, flavorSelectionLimit, detail?.id);
      return nextIds.map((productId) => {
        const flavor = pizzaFlavorCatalog.find((item) => item.id === productId);
        return { productId, name: flavor?.name ?? detail?.name ?? 'Pizza' };
      });
    });
  }, [categoryFlavors, detail, flavorSelectionLimit, isPizzaTemplate, pizzaFlavorCatalog]);

  useEffect(() => {
    if (!isPizzaTemplate || !detail || !pizzaSizeId || selectedPizzaFlavors.length === 0) {
      setPizzaPreview(null);
      setPizzaPreviewMeta(null);
      setPizzaPreviewLoading(false);
      setPizzaPreviewError(null);
      return;
    }

    let cancelled = false;
    setPizzaPreviewLoading(true);
    setPizzaPreviewError(null);

    api.post<{ sizeId: string; sizeName: string; strategy: string; calculatedPrice: number }>(`/catalog/pizza/simulate`, {
      categoryId: detail.category?.id,
      sizeId: pizzaSizeId,
      flavors: selectedPizzaFlavors.map((flavor) => ({
        productId: flavor.productId,
        fraction: selectedPizzaFlavors.length > 1 ? 0.5 : 1,
      })),
    })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setPizzaPreviewMeta({
            sizeName: res.data.sizeName,
            strategy: res.data.strategy,
            calculatedPrice: res.data.calculatedPrice,
          });
          setPizzaPreview({
            unitPrice: res.data.calculatedPrice,
            label: `${res.data.sizeName} · ${selectedPizzaFlavors.map((f) => f.name).join(' / ')}`,
          });
        } else {
          setPizzaPreview(null);
          setPizzaPreviewMeta(null);
          setPizzaPreviewError('Não foi possível simular a pizza.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPizzaPreview(null);
        setPizzaPreviewMeta(null);
        setPizzaPreviewError('Não foi possível simular a pizza.');
      })
      .finally(() => {
        if (!cancelled) setPizzaPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detail, isPizzaTemplate, selectedPizzaFlavors, pizzaSizeId]);

  const computed = useMemo(() => {
    if (!detail) return { unitPrice: 0, label: '' };

    const base = Number(detail.basePrice ?? 0);

    if (isSlotCombo) {
      let extras = 0;
      const parts: string[] = [];

      for (const slot of detail.comboSlots ?? []) {
        const state = slotState.find((s) => s.comboSlotId === slot.id);
        const selected = state?.items ?? [];

        const chosenNames: string[] = [];
        for (const chosen of selected) {
          const allowed = slot.allowedItems.find((ai) => ai.productId === chosen.productId);
          if (allowed) {
            extras += Number(allowed.additionalPrice ?? 0) * Math.max(1, Number(chosen.qty ?? 1));
            chosenNames.push(allowed.product?.name ?? 'Item');
          }
        }

        if (chosenNames.length > 0) parts.push(`${slot.name}: ${chosenNames.join(', ')}`);
      }

      return { unitPrice: Number((base + extras).toFixed(2)), label: parts.join('; ') };
    }

    if (hasV2Options) {
      const priced = computeOptionSelectionsPrice(genericOptionDetail ?? detail, selectionState);
      return { unitPrice: priced.unitPrice, label: priced.composition };
    }

    if (isPizzaTemplate) {
      const secondaryOptions = computeOptionSelectionsPrice(detail, selectionState);

      const pizzaBase = pizzaPreview?.unitPrice ?? base;
      return {
        unitPrice: Number((pizzaBase + (secondaryOptions.unitPrice - base)).toFixed(2)),
        label: `${pizzaPreview?.label || `Sabores: ${selectedPizzaFlavors.map((f) => f.name).join(' / ')}`}${secondaryOptions.composition ? `; ${secondaryOptions.composition}` : ''}`,
      };
    }

    return { unitPrice: base, label: '' };
  }, [detail, genericOptionDetail, hasV2Options, isSlotCombo, selectionState, slotState, isPizzaTemplate, selectedPizzaFlavors, pizzaPreview]);

  const total = computed.unitPrice * quantity;

  const validateNow = useCallback((): string | null => {
    if (!detail) return 'Produto não carregado.';
 
    if (hasV2Options) {
      try {
        computeOptionSelectionsPrice(genericOptionDetail ?? detail, selectionState);
      } catch (e) {
        return e instanceof Error ? e.message : 'Seleção inválida.';
      }
    }
    if (isSlotCombo) {
      for (const slot of detail.comboSlots ?? []) {
        const selected = slotState.find((s) => s.comboSlotId === slot.id)?.items ?? [];
        const count = selected.length;
        const effectiveMin = slot.isRequired ? Math.max(1, Number(slot.minSelect ?? 0)) : Number(slot.minSelect ?? 0);
        if (count < effectiveMin) {
          return `Selecione pelo menos ${effectiveMin} itens em "${slot.name}".`;
        }
        if (count > Number(slot.maxSelect ?? 0)) {
          return `Máximo de ${slot.maxSelect} itens em "${slot.name}".`;
        }
      }
    }
 
    if (isPizzaTemplate) {
      if (!pizzaSizeId) return 'Selecione um tamanho.';
      if (pizzaMountingGroup && !selectedPizzaMountingItemId) return 'Selecione a montagem da pizza.';
      if (selectedPizzaFlavors.length === 0) return 'Selecione pelo menos 1 sabor.';
      if (selectedPizzaFlavors.length > flavorSelectionLimit) {
        return `Selecione no máximo ${flavorSelectionLimit} sabor${flavorSelectionLimit > 1 ? 'es' : ''}.`;
      }
      if (pizzaPreviewLoading) return 'Aguarde a simulação do preço.';
      if (pizzaPreviewError) return pizzaPreviewError;
    }
 
    return null;
  }, [detail, genericOptionDetail, hasV2Options, isSlotCombo, slotState, isPizzaTemplate, selectionState, selectedPizzaFlavors, flavorSelectionLimit, pizzaMountingGroup, pizzaPreviewError, pizzaPreviewLoading, selectedPizzaMountingItemId, pizzaSizeId]);
 
  const currentValidationError = useMemo(() => {
    if (!isOpen) return null;
    return validateNow();
  }, [isOpen, validateNow]);


  const toggleOption = (optionGroupId: string, optionItemId: string, selectionType: 'single' | 'multiple' | 'quantity', maxSelect: number) => {
    setSelectionState((prev) => {
      const next = prev.map((g) => ({ ...g, items: [...g.items] }));
      const group = next.find((g) => g.optionGroupId === optionGroupId);
      if (!group) return prev;

      const exists = group.items.find((i) => i.optionItemId === optionItemId);
      if (exists) {
        group.items = group.items.filter((i) => i.optionItemId !== optionItemId);
        return next;
      }

      if (selectionType === 'single') {
        group.items = [{ optionItemId }];
        return next;
      }

      if (group.items.length >= maxSelect) return prev;

      group.items = [...group.items, { optionItemId }];
      return next;
    });
  };

  const setQuantityOption = (optionGroupId: string, optionItemId: string, qty: number) => {
    setSelectionState((prev) => {
      const next = prev.map((g) => ({ ...g, items: [...g.items] }));
      const group = next.find((g) => g.optionGroupId === optionGroupId);
      if (!group) return prev;

      const existing = group.items.find((i) => i.optionItemId === optionItemId);
      if (!existing) {
        group.items = [...group.items, { optionItemId, qty: Math.max(1, qty) }];
      } else {
        existing.qty = Math.max(1, qty);
      }

      return next;
    });
  };

  const toggleSlotItem = (comboSlotId: string, productId: string, maxSelect: number) => {
    setSlotState((prev) => {
      const next = prev.map((s) => ({ ...s, items: [...s.items] }));
      const slot = next.find((s) => s.comboSlotId === comboSlotId);
      if (!slot) return prev;

      const exists = slot.items.find((i) => i.productId === productId);
      if (exists) {
        slot.items = slot.items.filter((i) => i.productId !== productId);
        return next;
      }

      if (slot.items.length >= maxSelect) return prev;
      slot.items = [...slot.items, { productId, qty: 1 }];
      return next;
    });
  };

  const togglePizzaFlavor = (flavor: { id: string; name: string }) => {
    setSelectedPizzaFlavors(prev => {
      const nextIds = normalizePizzaFlavorSelection(
        prev.map((item) => item.productId),
        flavor.id,
        flavorSelectionLimit,
      );
      return nextIds.map((productId) => {
        const matched = pizzaFlavorCatalog.find((item) => item.id === productId);
        return { productId, name: matched?.name ?? flavor.name };
      });
    });
  };

  const togglePizzaMounting = (itemId: string) => {
    setSelectedPizzaMountingItemId(itemId);
    const nextLimit = getPizzaFlavorSelectionLimit(itemId, pizzaMountingItems);
    setSelectedPizzaFlavors((current) => {
      const currentIds = current.map((item) => item.productId);
      const nextIds = trimPizzaFlavorSelection(currentIds, nextLimit, detail?.id);
      return nextIds.map((productId) => {
        const matched = pizzaFlavorCatalog.find((item) => item.id === productId);
        return { productId, name: matched?.name ?? detail?.name ?? 'Pizza' };
      });
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 safe-modal">
      <div className="bg-card dark:bg-muted900 w-full max-w-2xl sm:rounded-3xl flex flex-col max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-1rem)] safe-sheet border border-border dark:border-border800 shadow-2xl">
        <div className="px-6 py-4 border-b border-border dark:border-border800 flex items-center gap-3 bg-card">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none">Configurar item</div>
            <div className="text-foreground font-black text-lg truncate mt-1 leading-none uppercase tracking-tight">{detail?.name ?? 'Carregando...'}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-card dark:hover:bg-muted800 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground font-bold uppercase tracking-widest animate-pulse">Carregando...</div>
          ) : error ? (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-2xl text-sm font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          ) : detail ? (
            <>
              {isPizzaTemplate && (
                <div className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-foreground font-black text-sm uppercase tracking-wider">Sabores</div>
                      <div className="text-[10px] text-muted-foreground font-bold italic">Selecione até 4 sabores para compor sua pizza</div>
                    </div>
                    <div className="text-[10px] font-black uppercase text-muted-foreground">{selectedPizzaFlavors.length}/4</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {categoryFlavors.map(f => {
                      const isSelected = selectedPizzaFlavors.some(pf => pf.productId === f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => togglePizzaFlavor({ id: f.id, name: f.name })}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            isSelected ? 'bg-status-success/10 border-status-success/20' : 'bg-card dark:bg-muted900 border-border dark:border-border800 hover:border-border'
                          }`}
                        >
                          <div className="text-foreground font-bold text-[11px] truncate">{f.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isSlotCombo ? (
                <div className="space-y-5">
                  {(detail.comboSlots ?? []).map((slot) => {
                    const selected = slotState.find((s) => s.comboSlotId === slot.id)?.items ?? [];
                    return (
                      <div key={slot.id} className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <div className="text-foreground font-black text-sm uppercase tracking-wider">{slot.name}</div>
                            <div className="text-[10px] text-muted-foreground font-bold">
                              {slot.isRequired ? `Obrigatório • ` : ''}
                              {slot.minSelect === slot.maxSelect ? `Escolha ${slot.minSelect}` : `Escolha ${slot.minSelect} a ${slot.maxSelect}`}
                            </div>
                          </div>
                          <div className="text-[10px] font-black uppercase text-muted-foreground">{selected.length}/{slot.maxSelect}</div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {slot.allowedItems
                            .filter((ai) => ai.product && ai.product.isActive && !ai.product.deletedAt)
                            .map((ai) => {
                              const isSelected = selected.some((s) => s.productId === ai.productId);
                              return (
                                <button
                                  key={ai.id}
                                  onClick={() => toggleSlotItem(slot.id, ai.productId, slot.maxSelect)}
                                  className={`p-3 rounded-xl border text-left transition-all ${
                                      isSelected
                                        ? 'bg-status-success/10 border-status-success/20'
                                        : 'bg-card dark:bg-muted900 border-border dark:border-border800 hover:border-border'
                                    }`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-foreground font-bold text-xs truncate">{ai.product?.name}</div>
                                      <div className="text-[10px] text-muted-foreground font-bold">
                                        + {formatCurrency(Number(ai.additionalPrice ?? 0))}
                                      </div>
                                    </div>
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${isSelected ? 'bg-status-success border-status-success text-foreground' : 'border-border dark:border-border700 text-muted-foreground'}`}>
                                        {isSelected ? <ChevronRight className="w-4 h-4" /> : null}
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
              ) : null}

              {isPizzaTemplate ? (
                <div className="space-y-4">
                  <div className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-foreground font-black text-sm uppercase tracking-wider">Pizza</div>
                        <div className="text-[10px] text-muted-foreground font-bold italic">
                          {isHalfAndHalf ? 'Escolha ate 2 sabores meio a meio' : 'Escolha 1 sabor para a pizza inteira'}
                        </div>
                      </div>
                      <div className="text-[10px] font-black uppercase text-muted-foreground">
                        {selectedPizzaFlavors.length}/{flavorSelectionLimit}
                      </div>
                    </div>
                  </div>

                  <div className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-foreground font-black text-sm uppercase tracking-wider">Tamanho</div>
                        <div className="text-[10px] text-muted-foreground font-bold">Selecione o tamanho da pizza</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {pizzaSizeItems.map((size) => {
                        const selected = pizzaSizeId === size.id;
                        return (
                          <button
                            key={size.id}
                            type="button"
                            onClick={() => setPizzaSizeId(size.id)}
                            className={`px-3 py-3 rounded-xl border text-xs font-black transition-all ${
                              selected
                                ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                                : 'bg-card dark:bg-muted900 border-border dark:border-border800 text-foreground hover:border-primary/40'
                            }`}
                            aria-pressed={selected}
                          >
                            {size.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {pizzaMountingGroup ? (
                    <div className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-foreground font-black text-sm uppercase tracking-wider">Montagem</div>
                          <div className="text-[10px] text-muted-foreground font-bold">Escolha como a pizza sera montada</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {pizzaMountingItems.map((item) => {
                          const selected = selectedPizzaMountingItemId === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => togglePizzaMounting(item.id)}
                              className={`p-3 rounded-xl border text-left transition-all ${
                                selected
                                  ? 'bg-primary/10 border-primary/20 ring-1 ring-primary/20'
                                  : 'bg-card dark:bg-muted900 border-border dark:border-border800 hover:border-border'
                              }`}
                              aria-pressed={selected}
                            >
                              <div className={`text-xs font-bold truncate ${selected ? 'text-primary' : 'text-foreground'}`}>
                                {item.name}
                              </div>
                              {item.description ? (
                                <div className="text-[10px] text-muted-foreground font-bold mt-0.5 line-clamp-2">
                                  {item.description}
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-foreground font-black text-sm uppercase tracking-wider">Sabores</div>
                        <div className="text-[10px] text-muted-foreground font-bold">
                          {isHalfAndHalf ? 'Toque para escolher ate 2 sabores' : 'Toque para escolher 1 sabor'}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {pizzaFlavorCatalog.map((flavor) => {
                        const selected = selectedPizzaFlavors.some((entry) => entry.productId === flavor.id);
                        return (
                          <button
                            key={flavor.id}
                            type="button"
                            onClick={() => togglePizzaFlavor({ id: flavor.id, name: flavor.name })}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              selected
                                ? 'bg-status-success/10 border-status-success/20'
                                : 'bg-card dark:bg-muted900 border-border dark:border-border800 hover:border-border'
                            }`}
                            aria-pressed={selected}
                          >
                            <div className="text-foreground font-bold text-[11px] truncate">{flavor.name}</div>
                            {selected ? (
                              <div className="text-[10px] font-bold text-status-success mt-0.5">
                                {selectedPizzaFlavors.length === 2 ? '1/2 da pizza' : 'Sabor principal'}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Preco</div>
                        <div className="text-lg font-black text-foreground">
                          {pizzaPreviewLoading ? 'Simulando...' : formatCurrency(computed.unitPrice)}
                        </div>
                      </div>
                      {pizzaPreviewMeta ? (
                        <div className="text-right">
                          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Regra</div>
                          <div className="text-xs font-bold text-foreground capitalize">{pizzaPreviewMeta.strategy}</div>
                        </div>
                      ) : null}
                    </div>
                    {pizzaPreviewMeta ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {pizzaPreviewMeta.sizeName} - {selectedPizzaFlavors.map((f) => f.name).join(' / ')}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {!isSlotCombo && hasV2Options ? (
                <div className="space-y-5">
                  {genericOptionLinks
                    .map((link) => {
                      const group = link.optionGroup;
                      const groupName = link.overrideName ?? group.name;
                      const minSelect = link.overrideMinSelect ?? group.minSelect;
                      const maxSelect = link.overrideMaxSelect ?? group.maxSelect;
                      const isRequired = link.overrideIsRequired ?? group.isRequired;

                      const state = selectionState.find((s) => s.optionGroupId === group.id);
                      const selectedIds = new Set((state?.items ?? []).map((i) => i.optionItemId));

                      return (
                        <div key={group.id} className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <div className="text-foreground font-black text-sm uppercase tracking-wider">{groupName}</div>
                                <div className="text-[10px] text-muted-foreground font-bold">
                                {isRequired ? `Obrigatório • ` : ''}
                                {group.selectionType === 'single' ? 'Escolha 1' : `Escolha até ${maxSelect}`}
                              </div>
                            </div>
                            <div className="text-[10px] font-black uppercase text-muted-foreground">
                              {(state?.items ?? []).length}/{maxSelect}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {group.items
                              .filter((i) => i.isActive)
                              .map((i) => {
                                const isSelected = selectedIds.has(i.id);
                                const priceImpactValue = Number(i.priceImpactValue ?? 0);

                                return (
                                  <div key={i.id} className="bg-card dark:bg-muted900 border border-border dark:border-border800 rounded-xl p-3">
                                    <button
                                      onClick={() => toggleOption(group.id, i.id, group.selectionType, Number(maxSelect ?? 0))}
                                      className="w-full text-left"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-foreground font-bold text-xs truncate">{i.name}</div>
                                          <div className="text-[10px] text-muted-foreground font-bold">
                                            {i.priceImpactType === 'fixed' ? `+ ${formatCurrency(priceImpactValue)}` :
                                              i.priceImpactType === 'percentage' ? `+ ${priceImpactValue}%` :
                                                i.priceImpactType === 'replace' ? `Preço: ${formatCurrency(priceImpactValue)}` :
                                                  ''}
                                          </div>
                                        </div>
                                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${isSelected ? 'bg-status-success border-status-success text-foreground' : 'border-border dark:border-border700 text-muted-foreground'}`}>
                                                      {isSelected ? <ChevronRight className="w-4 h-4" /> : null}
                                                    </div>
                                      </div>
                                    </button>

                                    {group.selectionType === 'quantity' && isSelected && i.allowQuantity ? (
                                      <div className="mt-3 flex items-center gap-3">
                                        <button
                                          onClick={() => {
                                            const current = state?.items.find((x) => x.optionItemId === i.id)?.qty ?? 1;
                                            setQuantityOption(group.id, i.id, Math.max(1, current - 1));
                                          }}
                                          className="w-8 h-8 rounded-xl bg-card border border-border text-muted-foreground flex items-center justify-center"
                                        >
                                          <Minus className="w-4 h-4" />
                                        </button>
                                        <div className="text-foreground font-black">
                                          {state?.items.find((x) => x.optionItemId === i.id)?.qty ?? 1}
                                        </div>
                                        <button
                                          onClick={() => {
                                            const current = state?.items.find((x) => x.optionItemId === i.id)?.qty ?? 1;
                                            setQuantityOption(group.id, i.id, current + 1);
                                          }}
                                          className="w-8 h-8 rounded-xl bg-card border border-border text-muted-foreground flex items-center justify-center"
                                        >
                                          <Plus className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                          </div>

                          <div className="mt-3 text-[10px] text-muted-foreground font-bold">
                            {Number(minSelect ?? 0) > 0 ? `Mínimo: ${minSelect}. ` : ''}
                            Máximo: {maxSelect}.
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : null}


              <div className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Observações</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input-premium min-h-[80px] text-sm py-3"
                  placeholder="Ex: sem cebola..."
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="px-6 py-6 border-t border-border dark:border-border800 bg-card/50 dark:bg-muted900/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-card dark:bg-muted900 border border-border dark:border-border800 rounded-2xl p-1 h-14 shadow-sm">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-12 h-12 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card dark:hover:bg-muted800 rounded-xl transition-colors"
              >
                <Minus className="w-5 h-5" />
              </button>
              <span className="w-10 text-center font-black text-foreground text-lg">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-12 h-12 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card dark:hover:bg-muted800 rounded-xl transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <button
              disabled={!!currentValidationError || loading || !detail}
              onClick={() => {
                if (!detail) return;
                const selectionsDto = hasV2Options ? buildSelectionsDto(selectionState) : undefined;
                const slotsDto = isSlotCombo ? buildSlotsDto(slotState) : undefined;

                const pizzaComposition: PizzaCompositionDTO | undefined = isPizzaTemplate ? {
                  sizeId: pizzaSizeId,
                  sizeName: pizzaPreviewMeta?.sizeName ?? undefined,
                  pricingStrategy: pizzaPreviewMeta?.strategy,
                  calculatedPrice: pizzaPreviewMeta?.calculatedPrice ?? pizzaPreview?.unitPrice,
                  flavors: selectedPizzaFlavors.map((f) => ({
                    productId: f.productId,
                    fraction: 1 / selectedPizzaFlavors.length,
                  })),
                } : undefined;

                onConfirm({
                  productId: detail.id,
                  name: detail.name,
                  lineType: detail.type === 'combo' ? 'combo' : 'product',
                  quantity,
                  notes: notes || undefined,
                  selections: hasV2Options ? selectionsDto : undefined,
                  pizzaComposition,
                  slots: isSlotCombo ? slotsDto : undefined,
                  computedUnitPrice: computed.unitPrice,
                  compositionLabel: computed.label,
                });
              }}
              className={`flex-1 h-14 rounded-2xl flex items-center justify-between px-6 transition-all shadow-xl active:scale-95 ${
                currentValidationError || loading || !detail
                ? 'bg-muted100 dark:bg-muted800 text-muted-foreground cursor-not-allowed shadow-none' 
                : 'bg-primary hover:bg-primary/90 text-white shadow-primary/20'
              }`}
            >
              <div className="text-left">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-80 leading-none">Confirmar</div>
                <div className="text-sm font-black leading-none mt-1">ADICIONAR AO PEDIDO</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black uppercase opacity-80 leading-none">Total</div>
                <div className="text-lg font-black leading-none mt-1">{formatCurrency(total)}</div>
              </div>
            </button>
          </div>
          
          {currentValidationError && (
            <div className="mt-4 flex items-center justify-center gap-2 text-status-warning font-bold text-[10px] uppercase tracking-widest bg-status-warning/5 py-2 rounded-xl border border-status-warning/10">
              <AlertCircle className="w-3 h-3" />
              {currentValidationError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
