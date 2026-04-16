import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { Modal } from '../../components/Modal';
import {
  CatalogAvailabilityRule,
  CatalogPublication,
  ComboSlot,
  ComboSlotAllowedItem,
  CreateAvailabilityRuleDto,
  CreateComboSlotAllowedItemDto,
  CreateComboSlotDto,
  CreateProductOptionGroupLinkDto,
  OptionGroup,
  Product,
  ProductOptionGroupLink,
  UpdateAvailabilityRuleDto,
  UpdateComboSlotAllowedItemDto,
  UpdateComboSlotDto,
  UpdateProductOptionGroupLinkDto,
  UpsertPublicationDto,
} from '@gestor/types';

type TabKey = 'geral' | 'personalizacao' | 'combo' | 'publicacao';

type ProductDetails = Product & {
  optionGroupLinks?: Array<ProductOptionGroupLink & { optionGroup: OptionGroup & { items?: any[] } }>;
  comboSlots?: Array<ComboSlot & { allowedItems?: Array<ComboSlotAllowedItem & { product?: Product }> }>;
  publication?: (CatalogPublication & { rules?: CatalogAvailabilityRule[] }) | null;
  optionItemPrices?: Array<{ id: string; optionItemId: string; price: number | string }>;
};

type LinkWithGroup = ProductOptionGroupLink & {
  optionGroup: OptionGroup;
};

type SlotWithAllowed = ComboSlot & {
  allowedItems?: Array<ComboSlotAllowedItem & { product?: Product }>;
};

type ProductV2EditorMode = 'product' | 'combo';

type ProductV2EditorPageProps = {
  mode?: ProductV2EditorMode;
};

export function ProductV2EditorPage({ mode = 'product' }: ProductV2EditorPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isComboMode = mode === 'combo';

  const [tab, setTab] = useState<TabKey>('geral');
  const [isLoading, setIsLoading] = useState(true);
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [savingStates, setSavingStates] = useState<Record<string, boolean>>({});
  const [pizzaPrices, setPizzaPrices] = useState<Record<string, number>>({});

  const isNew = id === 'new' || !id;
  const productId = isNew ? '' : id;

  const [productForm, setProductForm] = useState<any>({
    name: '',
    categoryId: '',
    type: isComboMode ? 'combo' : 'simple',
    basePrice: 0,
    shortDescription: '',
    longDescription: '',
    sku: '',
    isActive: true,
    isAvailable: true,
    sellableOnline: true,
    image: '',
    order: 0,
  });

  // Personalização
  const [links, setLinks] = useState<LinkWithGroup[]>([]);
  const [allGroups, setAllGroups] = useState<OptionGroup[]>([]);
  const [isAddGroupModalOpen, setIsAddGroupModalOpen] = useState(false);
  const [selectedGroupIdToAdd, setSelectedGroupIdToAdd] = useState<string>('');
  const [isCreateComplementModalOpen, setIsCreateComplementModalOpen] = useState(false);
  const [newComplementForm, setNewComplementForm] = useState({
    name: '',
    description: '',
    selectionType: 'multiple' as 'single' | 'multiple' | 'quantity',
    isRequired: false,
    minSelect: 0,
    maxSelect: 1,
    isActive: true,
    order: 0,
  });

  const [isEditLinkModalOpen, setIsEditLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkWithGroup | null>(null);
  const [linkForm, setLinkForm] = useState<UpdateProductOptionGroupLinkDto>({
    overrideIsRequired: undefined,
    overrideMinSelect: undefined,
    overrideMaxSelect: undefined,
    pricingAxis: undefined,
  });

  // Combo
  const [slots, setSlots] = useState<SlotWithAllowed[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<SlotWithAllowed | null>(null);
  const [slotForm, setSlotForm] = useState<CreateComboSlotDto>({
    comboProductId: productId,
    name: '',
    description: '',
    isRequired: true,
    minSelect: 1,
    maxSelect: 1,
    order: 0,
  });

  const [isAllowedModalOpen, setIsAllowedModalOpen] = useState(false);
  const [allowedTargetSlotId, setAllowedTargetSlotId] = useState<string>('');
  const [editingAllowed, setEditingAllowed] = useState<(ComboSlotAllowedItem & { product?: Product }) | null>(null);
  const [allowedForm, setAllowedForm] = useState<CreateComboSlotAllowedItemDto>({
    comboSlotId: '',
    productId: '',
    additionalPrice: 0,
    order: 0,
  });

  // Publicação/Disponibilidade
  const [publication, setPublication] = useState<CatalogPublication | null>(null);
  const [rules, setRules] = useState<CatalogAvailabilityRule[]>([]);

  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CatalogAvailabilityRule | null>(null);
  const [ruleForm, setRuleForm] = useState<CreateAvailabilityRuleDto>({
    channel: 'storefront_delivery',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startTime: '00:00',
    endTime: '23:59',
    isActive: true,
  });

  const loadAll = async () => {
    setIsLoading(true);
    try {
      // Carregar categorias sempre
      const catRes = await api.get<any[]>('/catalog/categories');
      if (catRes.success) setCategories(catRes.data);

      if (isNew) {
        setIsLoading(false);
        return;
      }

      const [prodRes, linksRes, groupsRes, pubRes, rulesRes] = await Promise.all([
        api.get<ProductDetails>(`/catalog/products/${productId}`),
        api.get<LinkWithGroup[]>(`/catalog/products/${productId}/option-groups`),
        api.get<Array<OptionGroup & { items?: any[] }>>('/catalog/option-groups'),
        api.get<any>(`/catalog/products/${productId}/publication`),
        api.get<CatalogAvailabilityRule[]>(`/catalog/products/${productId}/publication/rules`),
      ]);

      if (prodRes.success) {
        setProduct(prodRes.data);
        if (prodRes.data.optionItemPrices) {
          const pricesMap: Record<string, number> = {};
          prodRes.data.optionItemPrices.forEach((p: any) => {
            pricesMap[p.optionItemId] = Number(p.price);
          });
          setPizzaPrices(pricesMap);
        }
        setProductForm({
          name: prodRes.data.name,
          categoryId: prodRes.data.categoryId || '',
          type: isComboMode ? 'combo' : (prodRes.data.type || 'simple'),
          basePrice: Number(prodRes.data.basePrice),
          shortDescription: prodRes.data.shortDescription || '',
          longDescription: prodRes.data.longDescription || '',
          sku: prodRes.data.sku || '',
          isActive: prodRes.data.isActive,
          isAvailable: prodRes.data.isAvailable,
          sellableOnline: prodRes.data.sellableOnline,
          image: prodRes.data.image || '',
          order: prodRes.data.order,
        });
      }
      if (linksRes.success) setLinks(linksRes.data);
      if (groupsRes.success) {
        setAllGroups(groupsRes.data);
        if (!selectedGroupIdToAdd) {
          setSelectedGroupIdToAdd(groupsRes.data[0]?.id ?? '');
        }
      }

      // Carregar combo-slots apenas se o produto for do tipo combo
      if (prodRes.success && (isComboMode || prodRes.data.type === 'combo')) {
        try {
          const slotsRes = await api.get<SlotWithAllowed[]>(`/catalog/products/${productId}/combo-slots`);
          if (slotsRes.success) setSlots(slotsRes.data);
        } catch (error) {
          console.warn('Não foi possível carregar combo-slots:', error);
          setSlots([]);
        }
      } else {
        setSlots([]);
      }

      if (pubRes.success) {
        const pub = pubRes.data as CatalogPublication;
        setPublication(pub);
      }
      if (rulesRes.success) setRules(rulesRes.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, isNew]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const handleSelectImageFile = (file: File | null) => {
    setImageFile(file);
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    if (file) {
      setImagePreviewUrl(URL.createObjectURL(file));
    } else {
      setImagePreviewUrl(productForm.image || null);
    }
  };

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.basePrice) {
      alert('Nome e Preço são obrigatórios.');
      return;
    }
    setSavingStates((p) => ({ ...p, saveProduct: true }));
    try {
      let finalImageUrl: string | undefined = productForm.image;

      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        const uploadRes = await api.upload<{ url: string }>('/upload/image', fd);
        if (uploadRes.success) {
          finalImageUrl = uploadRes.data.url;
        }
      }

      const payload = {
        ...productForm,
        type: isComboMode ? 'combo' : productForm.type,
        image: finalImageUrl,
        optionItemPrices: Object.entries(pizzaPrices).map(([optionItemId, price]) => ({
          optionItemId,
          price
        }))
      };

      if (isNew) {
        const res = await api.post<Product>('/catalog/products', payload);
        if (res.success) {
          navigate(`/catalog/products/${res.data.id}/v2`, { replace: true });
        }
      } else {
        const res = await api.patch<Product>(`/catalog/products/${productId}`, payload);
        if (res.success) {
          setProduct(res.data as ProductDetails);
          alert('Produto salvo com sucesso!');
          loadAll();
        }
      }
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      alert('Erro ao salvar produto.');
    } finally {
      setSavingStates((p) => ({ ...p, saveProduct: false }));
    }
  };

  const loadProductsIfNeeded = async () => {
    if (products.length > 0) return;
    const res = await api.get<Product[]>('/catalog/products');
    if (res.success) setProducts(res.data);
  };

  const linkedGroupIds = useMemo(() => new Set(links.map((l) => l.optionGroupId)), [links]);
  const availableGroupsToAdd = useMemo(() => {
    return allGroups.filter((g) => !linkedGroupIds.has(g.id));
  }, [allGroups, linkedGroupIds]);

  const allowedProducts = useMemo(() => {
    return products.filter((p) => (p.type ?? 'simple') !== 'combo');
  }, [products]);

  // -------------------- Personalização handlers --------------------

  const openAddGroupModal = async () => {
    setIsAddGroupModalOpen(true);
    if (!selectedGroupIdToAdd) {
      setSelectedGroupIdToAdd(availableGroupsToAdd[0]?.id ?? '');
    }
  };

  const addGroupLink = async () => {
    if (!selectedGroupIdToAdd) return;
    setSavingStates((p) => ({ ...p, addGroupLink: true }));
    try {
      const payload: Omit<CreateProductOptionGroupLinkDto, 'productId'> = {
        optionGroupId: selectedGroupIdToAdd,
        order: links.length,
        pricingAxis: 'secondary',
      };
      await api.post(`/catalog/products/${productId}/option-groups`, payload);
      setIsAddGroupModalOpen(false);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, addGroupLink: false }));
    }
  };

  const createComplementAndLink = async () => {
    if (!newComplementForm.name.trim()) return;
    setSavingStates((p) => ({ ...p, createComplementAndLink: true }));
    try {
      const created = await api.post<OptionGroup>('/catalog/option-groups', {
        ...newComplementForm,
        name: newComplementForm.name.trim(),
      });
      if (!created.success) return;

      await api.post(`/catalog/products/${productId}/option-groups`, {
        optionGroupId: created.data.id,
        order: links.length,
        pricingAxis: 'secondary',
      });

      setIsCreateComplementModalOpen(false);
      setNewComplementForm({
        name: '',
        description: '',
        selectionType: 'multiple',
        isRequired: false,
        minSelect: 0,
        maxSelect: 1,
        isActive: true,
        order: 0,
      });
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, createComplementAndLink: false }));
    }
  };

  const removeGroupLink = async (linkId: string) => {
    if (!window.confirm('Remover este grupo do produto?')) return;
    setSavingStates((p) => ({ ...p, [`remove-${linkId}`]: true }));
    try {
      await api.delete(`/catalog/products/${productId}/option-groups/${linkId}`);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, [`remove-${linkId}`]: false }));
    }
  };

  const openEditLinkModal = (link: LinkWithGroup) => {
    setEditingLink(link);
    setLinkForm({
      overrideIsRequired: link.overrideIsRequired ?? undefined,
      overrideMinSelect: link.overrideMinSelect ?? undefined,
      overrideMaxSelect: link.overrideMaxSelect ?? undefined,
      pricingAxis: link.pricingAxis,
    });
    setIsEditLinkModalOpen(true);
  };

  const saveLinkOverrides = async () => {
    if (!editingLink) return;
    setSavingStates((p) => ({ ...p, saveLinkOverrides: true }));
    try {
      // Enviar apenas campos definidos para evitar sobrescrever com undefined
      const payload: UpdateProductOptionGroupLinkDto = {
        ...(linkForm.overrideIsRequired !== undefined && { overrideIsRequired: linkForm.overrideIsRequired }),
        ...(linkForm.overrideMinSelect !== undefined && { overrideMinSelect: linkForm.overrideMinSelect }),
        ...(linkForm.overrideMaxSelect !== undefined && { overrideMaxSelect: linkForm.overrideMaxSelect }),
        ...(linkForm.pricingAxis && { pricingAxis: linkForm.pricingAxis }),
      };
      await api.patch(`/catalog/products/${productId}/option-groups/${editingLink.id}`, payload);
      setIsEditLinkModalOpen(false);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, saveLinkOverrides: false }));
    }
  };

  const reorderLinks = async (orderedIds: string[]) => {
    setSavingStates((p) => ({ ...p, reorderLinks: true }));
    try {
      await api.post(`/catalog/products/${productId}/option-groups/reorder`, { orderedLinkIds: orderedIds });
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, reorderLinks: false }));
    }
  };

  const moveLink = async (linkId: string, direction: -1 | 1) => {
    const list = [...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = list.findIndex((l) => l.id === linkId);
    const nextIdx = idx + direction;
    if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;
    const swapped = [...list];
    const tmp = swapped[idx];
    swapped[idx] = swapped[nextIdx];
    swapped[nextIdx] = tmp;
    await reorderLinks(swapped.map((l) => l.id));
  };

  // -------------------- Combo handlers --------------------

  const openSlotModal = (slot?: SlotWithAllowed) => {
    if (slot) {
      setEditingSlot(slot);
      setSlotForm({
        comboProductId: productId,
        name: slot.name,
        description: slot.description ?? '',
        isRequired: slot.isRequired,
        minSelect: slot.minSelect,
        maxSelect: slot.maxSelect,
        order: slot.order,
      });
    } else {
      setEditingSlot(null);
      setSlotForm({
        comboProductId: productId,
        name: '',
        description: '',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        order: slots.length,
      });
    }
    setIsSlotModalOpen(true);
  };

  const saveSlot = async () => {
    setSavingStates((p) => ({ ...p, saveSlot: true }));
    try {
      // Verificar se o produto é do tipo combo antes de prosseguir
      if (!product || product.type !== 'combo') {
        throw new Error('Apenas produtos do tipo combo podem ter slots.');
      }

      const payload: Omit<CreateComboSlotDto, 'comboProductId'> = {
        name: slotForm.name,
        description: slotForm.description,
        isRequired: slotForm.isRequired,
        minSelect: slotForm.minSelect,
        maxSelect: slotForm.maxSelect,
        order: slotForm.order,
      };

      if (editingSlot) {
        const upd: UpdateComboSlotDto = payload;
        await api.patch(`/catalog/products/${productId}/combo-slots/${editingSlot.id}`, upd);
      } else {
        await api.post(`/catalog/products/${productId}/combo-slots`, payload);
      }

      setIsSlotModalOpen(false);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, saveSlot: false }));
    }
  };

  const deleteSlot = async (slotId: string) => {
    if (!window.confirm('Excluir este slot do combo?')) return;
    setSavingStates((p) => ({ ...p, [`delete-slot-${slotId}`]: true }));
    try {
      await api.delete(`/catalog/products/${productId}/combo-slots/${slotId}`);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, [`delete-slot-${slotId}`]: false }));
    }
  };

  const reorderSlots = async (orderedSlotIds: string[]) => {
    setSavingStates((p) => ({ ...p, reorderSlots: true }));
    try {
      await api.post(`/catalog/products/${productId}/combo-slots/reorder`, { orderedSlotIds });
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, reorderSlots: false }));
    }
  };

  const moveSlot = async (slotId: string, direction: -1 | 1) => {
    const list = [...slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = list.findIndex((s) => s.id === slotId);
    const nextIdx = idx + direction;
    if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;
    const swapped = [...list];
    const tmp = swapped[idx];
    swapped[idx] = swapped[nextIdx];
    swapped[nextIdx] = tmp;
    await reorderSlots(swapped.map((s) => s.id));
  };

  const openAllowedModal = async (slotId: string, allowed?: ComboSlotAllowedItem & { product?: Product }) => {
    await loadProductsIfNeeded();
    setAllowedTargetSlotId(slotId);

    if (allowed) {
      setEditingAllowed(allowed);
      setAllowedForm({
        comboSlotId: slotId,
        productId: allowed.productId,
        additionalPrice: Number(allowed.additionalPrice ?? 0),
        order: allowed.order,
      });
    } else {
      setEditingAllowed(null);
      setAllowedForm({
        comboSlotId: slotId,
        productId: allowedProducts[0]?.id ?? '',
        additionalPrice: 0,
        order: 0,
      });
    }

    setIsAllowedModalOpen(true);
  };

  const saveAllowed = async () => {
    if (!allowedTargetSlotId) return;
    setSavingStates((p) => ({ ...p, saveAllowed: true }));
    try {
      const payload: Omit<CreateComboSlotAllowedItemDto, 'comboSlotId'> = {
        productId: allowedForm.productId,
        additionalPrice: allowedForm.additionalPrice,
        order: allowedForm.order,
      };

      if (editingAllowed) {
        const upd: UpdateComboSlotAllowedItemDto = payload as UpdateComboSlotAllowedItemDto;
        await api.patch(
          `/catalog/products/${productId}/combo-slots/${allowedTargetSlotId}/allowed-items/${editingAllowed.id}`,
          upd,
        );
      } else {
        await api.post(`/catalog/products/${productId}/combo-slots/${allowedTargetSlotId}/allowed-items`, payload);
      }

      setIsAllowedModalOpen(false);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, saveAllowed: false }));
    }
  };

  const deleteAllowed = async (slotId: string, idToDelete: string) => {
    if (!window.confirm('Excluir este item permitido?')) return;
    setSavingStates((p) => ({ ...p, [`delete-allowed-${idToDelete}`]: true }));
    try {
      await api.delete(`/catalog/products/${productId}/combo-slots/${slotId}/allowed-items/${idToDelete}`);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, [`delete-allowed-${idToDelete}`]: false }));
    }
  };

  const reorderAllowed = async (slotId: string, orderedAllowedItemIds: string[]) => {
    setSavingStates((p) => ({ ...p, [`reorder-allowed-${slotId}`]: true }));
    try {
      await api.post(`/catalog/products/${productId}/combo-slots/${slotId}/allowed-items/reorder`, { orderedAllowedItemIds });
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, [`reorder-allowed-${slotId}`]: false }));
    }
  };

  const moveAllowed = async (slot: SlotWithAllowed, allowedId: string, direction: -1 | 1) => {
    const list = [...(slot.allowedItems ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = list.findIndex((a) => a.id === allowedId);
    const nextIdx = idx + direction;
    if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;
    const swapped = [...list];
    const tmp = swapped[idx];
    swapped[idx] = swapped[nextIdx];
    swapped[nextIdx] = tmp;
    await reorderAllowed(slot.id, swapped.map((a) => a.id));
  };

  // -------------------- Publicação handlers --------------------

  const patchPublication = async (payload: UpsertPublicationDto) => {
    setSavingStates((p) => ({ ...p, patchPublication: true }));
    try {
      await api.patch(`/catalog/products/${productId}/publication`, payload);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, patchPublication: false }));
    }
  };

  const openRuleModal = (rule?: CatalogAvailabilityRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        channel: rule.channel,
        daysOfWeek: rule.daysOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        isActive: rule.isActive,
      });
    } else {
      setEditingRule(null);
      setRuleForm({
        channel: 'storefront_delivery',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: '00:00',
        endTime: '23:59',
        isActive: true,
      });
    }
    setIsRuleModalOpen(true);
  };

  const saveRule = async () => {
    setSavingStates((p) => ({ ...p, saveRule: true }));
    try {
      if (editingRule) {
        const upd: UpdateAvailabilityRuleDto = ruleForm as UpdateAvailabilityRuleDto;
        await api.patch(`/catalog/products/${productId}/publication/rules/${editingRule.id}`, upd);
      } else {
        const create: CreateAvailabilityRuleDto = ruleForm;
        await api.post(`/catalog/products/${productId}/publication/rules`, create);
      }
      setIsRuleModalOpen(false);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, saveRule: false }));
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!window.confirm('Excluir esta regra?')) return;
    setSavingStates((p) => ({ ...p, [`delete-rule-${ruleId}`]: true }));
    try {
      await api.delete(`/catalog/products/${productId}/publication/rules/${ruleId}`);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, [`delete-rule-${ruleId}`]: false }));
    }
  };

  if (!productId && !isNew) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="font-black text-gray-900">Produto inválido.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto text-left">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-gray-900 truncate">
            {isNew ? (isComboMode ? 'Novo Combo' : 'Novo Produto') : (isComboMode ? 'Editor de Combo' : 'Editor de Produto')}
          </h1>
          <p className="text-gray-500 mt-1 truncate">
            {isNew
              ? (isComboMode ? 'Crie a base do combo para iniciar a montagem' : 'Preencha as informações básicas para começar')
              : (product?.name ?? 'Carregando...')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(isComboMode ? '/catalog/combos' : '/catalog/products')}
            className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl border border-gray-200 bg-white"
          >
            Voltar
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-2 shadow-sm mb-4 sm:mb-6 flex gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('geral')}
          className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab === 'geral' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-50'}`}
        >
          Informações Gerais
        </button>
        {!isComboMode && (
          <button
            type="button"
            onClick={() => setTab('personalizacao')}
            disabled={isNew}
            className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab === 'personalizacao' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-50 disabled:opacity-50'}`}
          >
            Opcionais e Complementos
          </button>
        )}
        {isComboMode && (
          <button
            type="button"
            onClick={() => setTab('combo')}
            disabled={isNew}
            className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab === 'combo' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-50 disabled:opacity-50'}`}
          >
            Montagem do Combo
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab('publicacao')}
          disabled={isNew}
          className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab === 'publicacao' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-700 hover:bg-gray-50 disabled:opacity-50'}`}
        >
          Venda e Disponibilidade
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : null}

      {tab === 'geral' && (
        <section className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-black text-gray-900 mb-6">Informações Básicas</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome do Produto *</label>
                  <input
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                    placeholder="Ex: Burger de Costela"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Preço Base *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={productForm.basePrice}
                      onChange={(e) => setProductForm({ ...productForm, basePrice: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">SKU / Cód. Interno</label>
                    <input
                      value={productForm.sku}
                      onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                      placeholder="Identificador opcional"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Categoria</label>
                  <select
                    value={productForm.categoryId}
                    onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                  >
                    <option value="">Selecione uma categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {!isComboMode ? (
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Tipo de Produto</label>
                    <select
                      value={productForm.type}
                      onChange={(e) => setProductForm({ ...productForm, type: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                    >
                      <option value="simple">Simples</option>
                      <option value="configurable">Configurável (com variações)</option>
                    </select>
                  </div>
                ) : (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                    <div className="text-xs font-black uppercase tracking-wider text-indigo-700">Tipo</div>
                    <div className="text-sm font-bold text-indigo-900 mt-1">Combo</div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Imagem do Produto</label>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center relative group">
                      {(imagePreviewUrl || productForm.image) ? (
                        <img src={imagePreviewUrl || productForm.image} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-300 font-black">IMG</span>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleSelectImageFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 font-medium mb-2">Clique na imagem para enviar um novo arquivo.</p>
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreviewUrl(null); setProductForm({ ...productForm, image: '' }); }}
                        className="text-[10px] font-black uppercase text-red-500 hover:text-red-700"
                      >
                        Remover imagem
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Resumo / Descrição Curta</label>
                  <input
                    value={productForm.shortDescription}
                    onChange={(e) => setProductForm({ ...productForm, shortDescription: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                    placeholder="Breve descrição para o cardápio"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição Longa (Opcional)</label>
                  <textarea
                    rows={3}
                    value={productForm.longDescription}
                    onChange={(e) => setProductForm({ ...productForm, longDescription: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-bold"
                    placeholder="Detalhes completos do produto..."
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-6 border-t border-gray-100 pt-6">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={productForm.isActive}
                  onChange={(e) => setProductForm({ ...productForm, isActive: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <div className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">Ativo no Sistema</div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Controle mestre</div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={productForm.isAvailable}
                  onChange={(e) => setProductForm({ ...productForm, isAvailable: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <div className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">Disponível para venda</div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Estoque / Pausa</div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={productForm.sellableOnline}
                  onChange={(e) => setProductForm({ ...productForm, sellableOnline: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <div className="text-sm font-bold text-gray-700 group-hover:text-gray-900 transition-colors">Vender Online</div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">App / Web</div>
                </div>
              </label>
            </div>

            {/* Configuração Especial para Template Pizza */}
            {(() => {
              const selectedCategory = categories.find(c => c.id === productForm.categoryId);
              const isPizzaTemplate = selectedCategory?.templateType === 'pizza';
              const pizzaSizesGroup = product?.optionGroupLinks?.find(l => 
                l.optionGroup?.name.includes('Tamanhos [Pizza]')
              )?.optionGroup;
              const pizzaSizes = pizzaSizesGroup?.items || [];

              if (isPizzaTemplate && pizzaSizes.length > 0) {
                return (
                  <div className="mt-8 pt-8 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center text-xl">🍕</div>
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Configuração de Sabor</h3>
                        <p className="text-[10px] text-primary-600 font-bold uppercase tracking-wider mt-0.5">Preço por tamanho</p>
                      </div>
                    </div>

                    <div className="bg-primary-50/50 border border-primary-100 rounded-3xl p-6 sm:p-8">
                      <p className="text-sm text-primary-800 font-medium mb-8 leading-relaxed">
                        Este produto pertence a uma categoria de <strong>Pizzas</strong>. Defina abaixo o valor deste sabor para cada tamanho disponível.
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pizzaSizes.map(size => (
                          <div key={size.id} className="bg-white p-6 rounded-2xl border border-primary-100/50 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group">
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 group-hover:text-primary-600 transition-colors">
                              {size.name}
                            </label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={pizzaPrices[size.id] || ''}
                                onChange={(e) => setPizzaPrices({...pizzaPrices, [size.id]: Number(e.target.value)})}
                                className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-xl outline-none text-base font-black focus:ring-2 focus:ring-primary-500 transition-all placeholder:text-gray-300"
                                placeholder={productForm.basePrice.toString()}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={handleSaveProduct}
                disabled={savingStates.saveProduct}
                className="px-8 py-3 bg-primary-600 hover:bg-primary-700 text-white font-black rounded-xl shadow-lg shadow-primary-200 transition-all disabled:opacity-50 flex items-center gap-3"
              >
                {savingStates.saveProduct && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isNew ? (isComboMode ? 'CRIAR COMBO' : 'CRIAR PRODUTO') : 'SALVAR ALTERAÇÕES'}
              </button>
            </div>
          </div>
        </section>
      )}

      {tab === 'personalizacao' && !isComboMode && (
        <section className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="font-black text-gray-900">Complementos vinculados</div>
                <div className="text-sm text-gray-500 font-medium mt-1">
                  Vincule complementos reutilizáveis para personalização deste produto.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openAddGroupModal}
                  className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl"
                >
                  Vincular complemento
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateComplementModalOpen(true)}
                  className="px-4 py-2 text-sm font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl border border-primary-200"
                >
                  Criar novo complemento
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {[...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => (
              <div key={l.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="font-black text-gray-900">{l.optionGroup?.name ?? 'Complemento'}</div>
                <div className="text-xs text-gray-500 font-medium mt-1">
                  Base: req={String(l.optionGroup?.isRequired)} min={l.optionGroup?.minSelect} max={l.optionGroup?.maxSelect}
                </div>
                <div className="mt-3 text-xs font-bold text-gray-700">
                  Overrides: req={String(l.overrideIsRequired ?? '-')}
                  {' | '}min={l.overrideMinSelect ?? '-'}
                  {' | '}max={l.overrideMaxSelect ?? '-'}
                </div>
                <div className="mt-1 text-xs font-black text-gray-800">Axis: {l.pricingAxis}</div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => moveLink(l.id, -1)}
                    disabled={savingStates.reorderLinks}
                    className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLink(l.id, 1)}
                    disabled={savingStates.reorderLinks}
                    className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Descer
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditLinkModal(l)}
                    className="px-3 py-2 text-xs font-black text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl border border-primary-200"
                  >
                    Overrides
                  </button>
                  <button
                    type="button"
                    onClick={() => removeGroupLink(l.id)}
                    disabled={savingStates[`remove-${l.id}`]}
                    className="px-3 py-2 text-xs font-black text-red-700 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
            {links.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm italic">
                Nenhum complemento vinculado.
              </div>
            ) : null}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Complemento</th>
                  <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Overrides</th>
                  <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Axis</th>
                  <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{l.optionGroup?.name ?? 'Complemento'}</div>
                      <div className="text-xs text-gray-500 font-medium mt-1">
                        Base: req={String(l.optionGroup?.isRequired)} min={l.optionGroup?.minSelect} max={l.optionGroup?.maxSelect}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-700">
                      req={String(l.overrideIsRequired ?? '-')}
                      {' | '}min={l.overrideMinSelect ?? '-'}
                      {' | '}max={l.overrideMaxSelect ?? '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-black text-gray-800">{l.pricingAxis}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => moveLink(l.id, -1)}
                          disabled={savingStates.reorderLinks}
                          className="px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Subir"
                        >
                          {savingStates.reorderLinks ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↑'}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveLink(l.id, 1)}
                          disabled={savingStates.reorderLinks}
                          className="px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Descer"
                        >
                          {savingStates.reorderLinks ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↓'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditLinkModal(l)}
                          className="px-3 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded"
                        >
                          Overrides
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGroupLink(l.id)}
                          disabled={savingStates[`remove-${l.id}`]}
                          className="px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {savingStates[`remove-${l.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {links.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-gray-400 text-sm italic">
                      Nenhum complemento vinculado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {links.length === 0 && (
              <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
                <div className="text-3xl mb-4">⚙️</div>
                <div className="font-black text-gray-900 mb-1">Nenhum adicional vinculado</div>
                <div className="text-sm text-gray-500 mb-6 mx-auto max-w-sm">
                  Vincule um complemento reutilizável (como "Molhos" ou "Ingredientes Extras") para permitir a personalização deste produto.
                </div>
                <button
                  type="button"
                  onClick={openAddGroupModal}
                  className="px-6 py-2.5 text-sm font-black text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-all"
                >
                  Vincular meu primeiro complemento
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'combo' && isComboMode && (
        <section className="space-y-4">
          {productForm.type !== 'combo' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center shadow-sm">
              <div className="text-3xl mb-4 text-amber-500">🍱</div>
              <div className="font-black text-amber-900 text-lg mb-2">Este produto não é um Combo</div>
              <div className="text-sm text-amber-800 mb-6 mx-auto max-w-md">
                Para configurar itens e slots, você precisa primeiro alterar o <strong>Tipo de Produto</strong> para "Combo" na aba de informações gerais.
              </div>
              <button
                type="button"
                onClick={() => setTab('geral')}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl transition-all shadow-md shadow-amber-200 flex items-center gap-2 mx-auto"
              >
                Alterar para Combo agora
              </button>
            </div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="text-lg font-black text-gray-900 uppercase tracking-tight">Montagem do Combo</div>
                    <p className="text-sm text-gray-500 font-medium mt-1">
                      Configure os slots (etapas) e os produtos permitidos em cada um.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openSlotModal()}
                    className="px-6 py-2.5 text-sm font-black text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg shadow-primary-100 transition-all flex items-center gap-2 whitespace-nowrap"
                  >
                    <span>➕</span> Adicionar Slot
                  </button>
                </div>
              </div>

              <div className="space-y-4">
              {[...slots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((s) => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-4 sm:px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black text-gray-900 truncate">{s.name}</div>
                    <div className="text-xs text-gray-500 font-bold mt-1">
                      req={String(s.isRequired)} | min={s.minSelect} | max={s.maxSelect}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveSlot(s.id, -1)}
                      disabled={savingStates.reorderSlots}
                      className="px-3 py-2 sm:px-2 sm:py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl sm:rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Subir"
                    >
                      {savingStates.reorderSlots ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↑'}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlot(s.id, 1)}
                      disabled={savingStates.reorderSlots}
                      className="px-3 py-2 sm:px-2 sm:py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl sm:rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Descer"
                    >
                      {savingStates.reorderSlots ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↓'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openAllowedModal(s.id)}
                      className="px-3 py-2 sm:py-1 text-xs font-bold text-primary-700 hover:bg-primary-50 rounded-xl sm:rounded"
                    >
                      Adicionar produto
                    </button>
                    <button
                      type="button"
                      onClick={() => openSlotModal(s)}
                      className="px-3 py-2 sm:py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl sm:rounded"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSlot(s.id)}
                      disabled={savingStates[`delete-slot-${s.id}`]}
                      className="col-span-2 sm:col-auto px-3 py-2 sm:py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl sm:rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                    >
                      {savingStates[`delete-slot-${s.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="md:hidden p-4 space-y-3">
                  {[...(s.allowedItems ?? [])]
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    .map((a) => (
                      <div key={a.id} className="border border-gray-200 rounded-2xl p-4">
                        <div className="font-black text-gray-900">{a.product?.name ?? a.productId}</div>
                        <div className="text-xs text-gray-500 font-medium mt-1 truncate">id: {a.productId}</div>
                        <div className="mt-3 text-sm font-black text-gray-900">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(a.additionalPrice ?? 0))}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => moveAllowed(s, a.id, -1)}
                            disabled={savingStates[`reorder-allowed-${s.id}`]}
                            className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Subir
                          </button>
                          <button
                            type="button"
                            onClick={() => moveAllowed(s, a.id, 1)}
                            disabled={savingStates[`reorder-allowed-${s.id}`]}
                            className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Descer
                          </button>
                          <button
                            type="button"
                            onClick={() => openAllowedModal(s.id, a)}
                            className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAllowed(s.id, a.id)}
                            disabled={savingStates[`delete-allowed-${a.id}`]}
                            className="px-3 py-2 text-xs font-black text-red-700 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  {(s.allowedItems ?? []).length === 0 ? (
                    <div className="text-center text-gray-400 text-sm italic py-6">Nenhum item permitido.</div>
                  ) : null}
                </div>

                <div className="overflow-auto hidden md:block">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-white border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Produto permitido</th>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Preço adicional</th>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[...(s.allowedItems ?? [])]
                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                        .map((a) => (
                          <tr key={a.id} className="hover:bg-gray-50/30 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="font-bold text-gray-900">{a.product?.name ?? a.productId}</div>
                              <div className="text-xs text-gray-500 font-medium mt-1">id: {a.productId}</div>
                            </td>
                            <td className="px-6 py-4 text-sm font-black text-gray-900">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(a.additionalPrice ?? 0))}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => moveAllowed(s, a.id, -1)}
                                  disabled={savingStates[`reorder-allowed-${s.id}`]}
                                  className="px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Subir"
                                >
                                  {savingStates[`reorder-allowed-${s.id}`] ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↑'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveAllowed(s, a.id, 1)}
                                  disabled={savingStates[`reorder-allowed-${s.id}`]}
                                  className="px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Descer"
                                >
                                  {savingStates[`reorder-allowed-${s.id}`] ? <div className="w-3 h-3 border border-gray-600 border-t-transparent rounded-full animate-spin" /> : '↓'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAllowedModal(s.id, a)}
                                  className="px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteAllowed(s.id, a.id)}
                                  disabled={savingStates[`delete-allowed-${a.id}`]}
                                  className="px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                >
                                  {savingStates[`delete-allowed-${a.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                                  Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {(s.allowedItems ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-10 text-center text-gray-400 text-sm italic">
                            Nenhum item permitido.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

              {slots.length === 0 && (
                <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-16 text-center">
                  <div className="text-4xl mb-4 grayscale opacity-50">🍟</div>
                  <div className="font-black text-gray-900 mb-2">Combo sem estrutura</div>
                  <p className="text-sm text-gray-500 mb-6 mx-auto max-w-sm font-medium">
                    Adicione slots como "Escolha seu Burger" ou "Escolha sua Bebida" para compor a oferta deste combo.
                  </p>
                  <button
                    type="button"
                    onClick={() => openSlotModal()}
                    className="px-6 py-2.5 text-sm font-black text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-xl transition-all"
                  >
                    Criar meu primeiro slot
                  </button>
                </div>
              )}
                </div>
              </>
            )}
        </section>
      )}

      {tab === 'publicacao' && (
        <section className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="text-lg font-black text-gray-900 uppercase tracking-tight">Status de Venda</div>
                <p className="text-sm text-gray-500 font-medium mt-1">Controle onde e como os clientes veem este item.</p>
              </div>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => patchPublication({ publicationStatus: 'draft' })}
                  disabled={savingStates.patchPublication}
                  className="px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-gray-700 border-t-transparent rounded-full animate-spin" />}
                  Draft
                </button>
                <button
                  type="button"
                  onClick={() => patchPublication({ publicationStatus: 'published' })}
                  disabled={savingStates.patchPublication}
                  className="px-3 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Publicar
                </button>
                <button
                  type="button"
                  onClick={() => patchPublication({ operationalStatus: 'active' })}
                  disabled={savingStates.patchPublication}
                  className="px-3 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => patchPublication({ operationalStatus: 'hidden' })}
                  disabled={savingStates.patchPublication}
                  className="px-3 py-2 text-sm font-bold text-amber-700 hover:bg-amber-50 rounded-xl border border-amber-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-amber-700 border-t-transparent rounded-full animate-spin" />}
                  Hidden
                </button>
                <button
                  type="button"
                  onClick={() => patchPublication({ operationalStatus: 'sold_out_manual' })}
                  disabled={savingStates.patchPublication}
                  className="px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 rounded-xl border border-red-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-red-700 border-t-transparent rounded-full animate-spin" />}
                  Sold out
                </button>
                <button
                  type="button"
                  onClick={() => patchPublication({ operationalStatus: 'inactive' })}
                  disabled={savingStates.patchPublication}
                  className="px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100 rounded-xl border border-gray-200 bg-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingStates.patchPublication && <div className="w-4 h-4 border-2 border-gray-700 border-t-transparent rounded-full animate-spin" />}
                  Inactive
                </button>
              </div>
            </div>

            <div className="mt-4 text-sm font-bold text-gray-700">
              Status atual: <span className="font-black">{(publication as any)?.publicationStatus ?? 'draft'}</span>
              {' | '}Operação: <span className="font-black">{(publication as any)?.operationalStatus ?? 'active'}</span>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="font-black text-gray-900">Regras de disponibilidade</div>
                <div className="text-sm text-gray-500 font-medium mt-1">Janela por canal e dias da semana.</div>
              </div>
              <button
                type="button"
                onClick={() => openRuleModal()}
                className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl"
              >
                Nova regra
              </button>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {rules.map((r) => (
              <div key={r.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="font-black text-gray-900 truncate">{r.channel}</div>
                <div className="mt-1 text-xs text-gray-600 font-bold">Dias: {(r.daysOfWeek ?? []).join(', ')}</div>
                <div className="mt-1 text-xs text-gray-600 font-bold">Horário: {r.startTime} - {r.endTime}</div>
                <div className="mt-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {r.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openRuleModal(r)}
                    className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRule(r.id)}
                    disabled={savingStates[`delete-rule-${r.id}`]}
                    className="px-3 py-2 text-xs font-black text-red-700 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                  >
                    {savingStates[`delete-rule-${r.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                    Excluir
                  </button>
                </div>
              </div>
            ))}
            {rules.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center text-gray-400 text-sm italic">
                Nenhuma regra cadastrada.
              </div>
            ) : null}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Canal</th>
                  <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Dias</th>
                  <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Horário</th>
                  <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Ativo</th>
                  <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/30 transition-colors group">
                    <td className="px-6 py-4 font-bold text-gray-900">{r.channel}</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-700">{(r.daysOfWeek ?? []).join(', ')}</td>
                    <td className="px-6 py-4 text-sm font-black text-gray-900">
                      {r.startTime} - {r.endTime}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {r.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openRuleModal(r)}
                          className="px-3 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRule(r.id)}
                          disabled={savingStates[`delete-rule-${r.id}`]}
                          className="px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          {savingStates[`delete-rule-${r.id}`] && <div className="w-3 h-3 border border-red-600 border-t-transparent rounded-full animate-spin" />}
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm italic">
                      Nenhuma regra cadastrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Personalização Modals */}
      <Modal
        isOpen={isAddGroupModalOpen}
        onClose={() => setIsAddGroupModalOpen(false)}
        title="Vincular complemento ao produto"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAddGroupModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={addGroupLink}
              disabled={savingStates.addGroupLink || availableGroupsToAdd.length === 0}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.addGroupLink && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Vincular
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {availableGroupsToAdd.length > 0 ? (
            <>
              <div className="text-sm text-gray-600 font-bold">Selecione um complemento</div>
              <select
                value={selectedGroupIdToAdd}
                onChange={(e) => setSelectedGroupIdToAdd(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              >
                {availableGroupsToAdd.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <div className="text-sm text-gray-400 font-bold italic p-4 text-center">
              Nenhum complemento disponível para vínculo. Todos já estão vinculados.
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isCreateComplementModalOpen}
        onClose={() => setIsCreateComplementModalOpen(false)}
        title="Criar novo complemento"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsCreateComplementModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={createComplementAndLink}
              disabled={savingStates.createComplementAndLink || !newComplementForm.name.trim()}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.createComplementAndLink && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Criar e vincular
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome</label>
            <input
              value={newComplementForm.name}
              onChange={(e) => setNewComplementForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              placeholder="Ex: Molhos e adicionais"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Tipo de seleção</label>
            <select
              value={newComplementForm.selectionType}
              onChange={(e) => setNewComplementForm((p) => ({ ...p, selectionType: e.target.value as 'single' | 'multiple' | 'quantity' }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            >
              <option value="single">Escolha única</option>
              <option value="multiple">Múltipla escolha</option>
              <option value="quantity">Por quantidade</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Mínimo</label>
              <input
                type="number"
                value={newComplementForm.minSelect}
                onChange={(e) => setNewComplementForm((p) => ({ ...p, minSelect: Number(e.target.value || 0) }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Máximo</label>
              <input
                type="number"
                value={newComplementForm.maxSelect}
                onChange={(e) => setNewComplementForm((p) => ({ ...p, maxSelect: Number(e.target.value || 1) }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newComplementForm.isRequired}
              onChange={(e) => setNewComplementForm((p) => ({ ...p, isRequired: e.target.checked }))}
              className="w-4 h-4 text-primary-600"
            />
            <span className="text-sm font-bold text-gray-700">Obrigatório</span>
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={isEditLinkModalOpen}
        onClose={() => setIsEditLinkModalOpen(false)}
        title="Overrides do link"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsEditLinkModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveLinkOverrides}
              disabled={savingStates.saveLinkOverrides}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveLinkOverrides && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Pricing Axis</label>
            <select
              value={(linkForm.pricingAxis as any) ?? 'secondary'}
              onChange={(e) => setLinkForm((p) => ({ ...p, pricingAxis: e.target.value as any }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            >
              <option value="secondary">secondary</option>
              <option value="primary">primary</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(linkForm.overrideIsRequired)}
              onChange={(e) => setLinkForm((p) => ({ ...p, overrideIsRequired: e.target.checked }))}
              className="w-4 h-4 text-primary-600"
            />
            <span className="text-sm font-bold text-gray-700">Override required</span>
            <button
              type="button"
              onClick={() => setLinkForm((p) => ({ ...p, overrideIsRequired: undefined }))}
              className="ml-auto text-xs font-black text-gray-500 hover:text-gray-800"
            >
              limpar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Override min</label>
              <input
                type="number"
                value={linkForm.overrideMinSelect ?? ''}
                onChange={(e) => setLinkForm((p) => ({ ...p, overrideMinSelect: e.target.value === '' ? undefined : Number(e.target.value) }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Override max</label>
              <input
                type="number"
                value={linkForm.overrideMaxSelect ?? ''}
                onChange={(e) => setLinkForm((p) => ({ ...p, overrideMaxSelect: e.target.value === '' ? undefined : Number(e.target.value) }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Combo Modals */}
      <Modal
        isOpen={isSlotModalOpen}
        onClose={() => setIsSlotModalOpen(false)}
        title={editingSlot ? 'Editar slot' : 'Novo slot'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsSlotModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveSlot}
              disabled={savingStates.saveSlot}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveSlot && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Nome</label>
            <input
              value={slotForm.name}
              onChange={(e) => setSlotForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Descrição</label>
            <input
              value={slotForm.description ?? ''}
              onChange={(e) => setSlotForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(slotForm.isRequired)}
              onChange={(e) => setSlotForm((p) => ({ ...p, isRequired: e.target.checked }))}
              className="w-4 h-4 text-primary-600"
            />
            <span className="text-sm font-bold text-gray-700">Obrigatório</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Min</label>
              <input
                type="number"
                value={Number(slotForm.minSelect ?? 1)}
                onChange={(e) => setSlotForm((p) => ({ ...p, minSelect: Number(e.target.value || 1) }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Max</label>
              <input
                type="number"
                value={Number(slotForm.maxSelect ?? 1)}
                onChange={(e) => setSlotForm((p) => ({ ...p, maxSelect: Number(e.target.value || 1) }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isAllowedModalOpen}
        onClose={() => setIsAllowedModalOpen(false)}
        title={editingAllowed ? 'Editar item permitido' : 'Adicionar item permitido'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsAllowedModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveAllowed}
              disabled={savingStates.saveAllowed}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveAllowed && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {editingAllowed ? 'Salvar' : 'Adicionar'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Produto</label>
            <select
              value={allowedForm.productId}
              onChange={(e) => setAllowedForm((p) => ({ ...p, productId: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            >
              {allowedProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Preço adicional</label>
            <input
              type="number"
              step="0.01"
              value={Number(allowedForm.additionalPrice ?? 0)}
              onChange={(e) => setAllowedForm((p) => ({ ...p, additionalPrice: Number(e.target.value || 0) }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Rule Modal */}
      <Modal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
        title={editingRule ? 'Editar regra' : 'Nova regra'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsRuleModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveRule}
              disabled={savingStates.saveRule}
              className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveRule && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Canal</label>
            <select
              value={ruleForm.channel}
              onChange={(e) => setRuleForm((p) => ({ ...p, channel: e.target.value as any }))}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
            >
              <option value="storefront_delivery">storefront_delivery</option>
              <option value="storefront_pickup">storefront_pickup</option>
              <option value="pos">pos</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Dias (0-6)</label>
            <input
              value={(ruleForm.daysOfWeek ?? []).join(',')}
              onChange={(e) => {
                const parts = e.target.value
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .map((x) => Number(x))
                  .filter((n) => !Number.isNaN(n));
                setRuleForm((p) => ({ ...p, daysOfWeek: parts }));
              }}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
              placeholder="0,1,2,3,4,5,6"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Início</label>
              <input
                value={ruleForm.startTime}
                onChange={(e) => setRuleForm((p) => ({ ...p, startTime: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
                placeholder="HH:MM"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Fim</label>
              <input
                value={ruleForm.endTime}
                onChange={(e) => setRuleForm((p) => ({ ...p, endTime: e.target.value }))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none"
                placeholder="HH:MM"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(ruleForm.isActive)}
              onChange={(e) => setRuleForm((p) => ({ ...p, isActive: e.target.checked }))}
              className="w-4 h-4 text-primary-600"
            />
            <span className="text-sm font-bold text-gray-700">Ativa</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
