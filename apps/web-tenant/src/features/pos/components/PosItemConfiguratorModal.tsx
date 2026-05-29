import { useEffect, useMemo, useState } from 'react';
import { X, Minus, Plus, AlertCircle, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api-client';
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
  category?: { id: string; templateType?: string | null; templateConfig?: unknown } | null;
  complementGroups?: Array<{
    group: {
      id: string;
      name: string;
      description?: string | null;
      minSelect: number;
      maxSelect: number;
      isRequired: boolean;
      items: Array<{
        id: string;
        name: string;
        description?: string | null;
        additionalPrice: number;
        isActive: boolean;
      }>;
    };
  }>;
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

type SelectedComplement = { groupId: string; itemId: string };

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
  const links = (detail.optionGroupLinks ?? []).filter((l) => l.optionGroup?.isActive);

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
    complements?: SelectedComplement[];
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

  const [selectedComplements, setSelectedComplements] = useState<SelectedComplement[]>([]);
  const [selectionState, setSelectionState] = useState<SelectionState>([]);
  const [slotState, setSlotState] = useState<SlotState>([]);

  // Pizza Template State
  const [categoryFlavors, setCategoryFlavors] = useState<ProductDetail[]>([]);
  const [selectedPizzaFlavors, setSelectedPizzaFlavors] = useState<Array<{ productId: string; name: string }>>([]);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setDetail(null);
    setQuantity(1);
    setNotes('');
    setError(null);
    setSelectedComplements([]);
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
          .map((l) => ({ optionGroupId: l.optionGroup.id, items: [] }));
        setSelectionState(initialSelections);

        const initialSlots: SlotState = (data.comboSlots ?? []).map((s) => ({ comboSlotId: s.id, items: [] }));
        setSlotState(initialSlots);

        // If Pizza, fetch other flavors in same category
        if (data.category?.templateType === 'pizza' && data.category.id) {
          setSelectedPizzaFlavors([{ productId: data.id, name: data.name }]);
          api.get<ProductDetail[]>(`/catalog/products?categoryId=${data.category.id}`).then(catRes => {
            if (catRes.success) {
              setCategoryFlavors(catRes.data);
            }
          });
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Erro ao carregar produto.');
      })
      .finally(() => setLoading(false));
  }, [isOpen, productId]);

  const hasLegacyComplements = Boolean((detail?.complementGroups ?? []).length > 0);
  const hasV2Options = Boolean((detail?.optionGroupLinks ?? []).some((l) => l.optionGroup?.isActive));
  const isPizzaTemplate = detail?.category?.templateType === 'pizza';
  const isCombo = detail?.type === 'combo';
  const isSlotCombo = isCombo && (detail?.comboMode ?? 'bundle') === 'slot';

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
      const priced = computeOptionSelectionsPrice(detail, selectionState);
      return { unitPrice: priced.unitPrice, label: priced.composition };
    }

    if (hasLegacyComplements) {
      let extras = 0;
      const parts: string[] = [];

      for (const link of detail.complementGroups ?? []) {
        const group = link.group;
        const selected = selectedComplements.filter((s) => s.groupId === group.id);
        const names: string[] = [];

        for (const sel of selected) {
          const item = group.items.find((i) => i.id === sel.itemId);
          if (item) {
            extras += Number(item.additionalPrice ?? 0);
            names.push(item.name);
          }
        }

        if (names.length > 0) parts.push(`${group.name}: ${names.join(', ')}`);
      }

      return { unitPrice: Number((base + extras).toFixed(2)), label: parts.join('; ') };
    }

    if (isPizzaTemplate) {
      // Simplistic price: highest of selected flavors at selected size
      // We need the sizeId from primary axis
      const sizesLink = detail.optionGroupLinks?.find(l => l.pricingAxis === 'primary');
      const selectedSizeId = selectionState.find(s => s.optionGroupId === sizesLink?.optionGroup.id)?.items[0]?.optionItemId;
      
      let unitPrice = base;
      if (selectedSizeId) {
        // Find prices for each flavor (if available in detail, but here we only have the main one)
        // For simplicity in PDV PHASE 1: use the basePrice of the main product for now
        // OR use the highest base price among selected flavors.
        const highestBase = Math.max(...selectedPizzaFlavors.map(f => {
          const flavorDetail = categoryFlavors.find(cf => cf.id === f.productId);
          return flavorDetail?.basePrice ?? 0;
        }), base);
        unitPrice = highestBase;
      }

      // Add options price (like "Borda Recheada" which would be a secondary axis)
      const secondaryOptions = computeOptionSelectionsPrice(detail, selectionState.filter(s => s.optionGroupId !== sizesLink?.optionGroup.id));
      unitPrice += (secondaryOptions.unitPrice - base);

      return { unitPrice: Number(unitPrice.toFixed(2)), label: `Sabores: ${selectedPizzaFlavors.map(f => f.name).join(' / ')}${secondaryOptions.composition ? `; ${secondaryOptions.composition}` : ''}` };
    }

    return { unitPrice: base, label: '' };
  }, [detail, hasLegacyComplements, hasV2Options, isSlotCombo, selectionState, selectedComplements, slotState]);

  const total = computed.unitPrice * quantity;

  const validateNow = (): string | null => {
    if (!detail) return 'Produto não carregado.';

    if (hasV2Options) {
      try {
        computeOptionSelectionsPrice(detail, selectionState);
      } catch (e) {
        return e instanceof Error ? e.message : 'Seleção inválida.';
      }
    }

    if (hasLegacyComplements) {
      for (const link of detail.complementGroups ?? []) {
        const group = link.group;
        const selectedCount = selectedComplements.filter((s) => s.groupId === group.id).length;

        const effectiveMin = group.isRequired ? Math.max(1, Number(group.minSelect ?? 0)) : Number(group.minSelect ?? 0);
        if (selectedCount < effectiveMin) {
          return `Selecione pelo menos ${effectiveMin} opções em "${group.name}".`;
        }
        if (selectedCount > Number(group.maxSelect ?? 0)) {
          return `Máximo de ${group.maxSelect} opções em "${group.name}".`;
        }
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
      const sizesLink = detail.optionGroupLinks?.find(l => l.pricingAxis === 'primary');
      const sizeSelected = selectionState.find(s => s.optionGroupId === sizesLink?.optionGroup.id)?.items.length ?? 0;
      if (sizeSelected === 0) return 'Selecione um tamanho.';
      if (selectedPizzaFlavors.length === 0) return 'Selecione pelo menos 1 sabor.';
    }

    return null;
  };

  const currentValidationError = useMemo(() => {
    if (!isOpen) return null;
    return validateNow();
  }, [isOpen, detail, hasV2Options, hasLegacyComplements, isSlotCombo, isPizzaTemplate, selectionState, selectedComplements, slotState]);

  const toggleComplement = (groupId: string, itemId: string, maxSelect: number) => {
    setSelectedComplements((prev) => {
      const exists = prev.some((p) => p.groupId === groupId && p.itemId === itemId);
      if (exists) return prev.filter((p) => !(p.groupId === groupId && p.itemId === itemId));

      const groupCount = prev.filter((p) => p.groupId === groupId).length;
      if (groupCount >= maxSelect) return prev;

      return [...prev, { groupId, itemId }];
    });
  };

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
      const exists = prev.some(f => f.productId === flavor.id);
      if (exists) {
        if (prev.length === 1) return prev; // Must have at least 1
        return prev.filter(f => f.productId !== flavor.id);
      }
      if (prev.length >= 4) return prev; // Limit to 4 parts
      return [...prev, { productId: flavor.id, name: flavor.name }];
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-card dark:bg-muted900 w-full max-w-2xl sm:rounded-3xl flex flex-col max-h-[92vh] border border-border dark:border-border800 shadow-2xl">
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

              {!isSlotCombo && hasV2Options ? (
                <div className="space-y-5">
                  {(detail.optionGroupLinks ?? [])
                    .filter((l) => l.optionGroup?.isActive)
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

              {!isSlotCombo && !hasV2Options && hasLegacyComplements ? (
                <div className="space-y-5">
                  {(detail.complementGroups ?? []).map((link) => {
                    const group = link.group;
                    const selected = selectedComplements.filter((s) => s.groupId === group.id);
                    return (
                      <div key={group.id} className="bg-card dark:bg-muted900/40 border border-border dark:border-border800 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <div className="text-foreground font-black text-sm uppercase tracking-wider">{group.name}</div>
                            <div className="text-[10px] text-muted-foreground font-bold">
                              {group.isRequired ? `Obrigatório • ` : ''}
                              {group.maxSelect === 1 ? 'Escolha 1' : `Escolha até ${group.maxSelect}`}
                            </div>
                          </div>
                          <div className="text-[10px] font-black uppercase text-muted-foreground">{selected.length}/{group.maxSelect}</div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {group.items
                            .filter((i) => i.isActive)
                            .map((i) => {
                              const isSelected = selected.some((s) => s.itemId === i.id);
                              return (
                                  <button
                                  key={i.id}
                                  onClick={() => toggleComplement(group.id, i.id, group.maxSelect)}
                                  className={`p-3 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? 'bg-status-success/10 border-status-success/20'
                                      : 'bg-card dark:bg-muted900 border-border dark:border-border800 hover:border-border'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-foreground font-bold text-xs truncate">{i.name}</div>
                                      <div className="text-[10px] text-muted-foreground font-bold">+ {formatCurrency(Number(i.additionalPrice ?? 0))}</div>
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
                  sizeId: selectionState.find(s => s.optionGroupId === detail.optionGroupLinks?.find(l => l.pricingAxis === 'primary')?.optionGroup.id)?.items[0]?.optionItemId || '',
                  flavors: selectedPizzaFlavors.map(f => ({
                    productId: f.productId,
                    fraction: 1 / selectedPizzaFlavors.length
                  }))
                } : undefined;

                onConfirm({
                  productId: detail.id,
                  name: detail.name,
                  lineType: detail.type === 'combo' ? 'combo' : 'product',
                  quantity,
                  notes: notes || undefined,
                  complements: !hasV2Options && hasLegacyComplements ? selectedComplements : undefined,
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
