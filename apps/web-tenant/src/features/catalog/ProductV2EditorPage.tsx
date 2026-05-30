import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Sparkles, Plus } from 'lucide-react';
import { api } from '../../lib/api-client';
import { Modal } from '../../components/Modal'; // Assuming Modal is here
import { RecipeModal } from '../inventory/RecipeModal';
import { ProductBasicInfo } from './SubComponents/ProductBasicInfo';
import { ProductPersonalization } from './SubComponents/ProductPersonalization';
import { ComboBuilder } from './SubComponents/ComboBuilder';
import { PublicationSettings } from './SubComponents/PublicationSettings';
import { InfoTooltip } from '../../components/InfoTooltip';






import {
  CatalogAvailabilityRule,
  CatalogPublication,
  ComboSlot,
  ComboSlotAllowedItem,
  CreateAvailabilityRuleDto,
  CreateComboBundleItemDto,
  CreateComboSlotAllowedItemDto,
  CreateComboSlotDto,
  CreateProductOptionGroupLinkDto,
  OptionGroup,
  Product,
  ProductOptionGroupLink,
  UpdateAvailabilityRuleDto,
  UpdateComboBundleItemDto,
  UpdateComboSlotAllowedItemDto,
  UpdateComboSlotDto,
  UpdateProductOptionGroupLinkDto,
  UpsertPublicationDto,
  Upsell,
  ProductCategory,
  CreateProductDto,
  ProductDetails,
  OptionItem,
  ComboPricingType,
} from '@gestor/types';


type TabKey = 'geral' | 'personalizacao' | 'combo' | 'publicacao' | 'vendas';

type BundleSummary = {
  subtotal: number;
  discountTotal: number;
  finalPrice: number;
  pricingType: ComboPricingType;
  pricingValue: number;
};

type LinkWithGroup = ProductOptionGroupLink & {
  optionGroup: OptionGroup & { items?: OptionItem[] };
};

type SlotWithAllowed = ComboSlot & {
  allowedItems?: Array<ComboSlotAllowedItem & { product?: Product }>;
};

type BundleItemWithProduct = {
  id: string;
  comboProductId: string;
  productId: string;
  qty: number;
  sortOrder: number;
  product?: Product;
};

type ProductV2EditorMode = 'product' | 'combo';

type ProductV2EditorPageProps = {
  mode?: ProductV2EditorMode;
};

const COMBO_WIZARD_TABS: TabKey[] = ['geral', 'combo', 'publicacao'];
const PRODUCT_WIZARD_TABS: TabKey[] = ['geral', 'personalizacao', 'publicacao'];

const CHANNEL_LABELS: Record<string, string> = {
  storefront_delivery: 'Delivery',
  storefront_pickup: 'Retirada',
  pos: 'Balcao / PDV',
};

const DAY_OPTIONS = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terca-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sabado' },
  { value: 0, label: 'Domingo' },
];

const formatChannelLabel = (channel?: string | null) => CHANNEL_LABELS[channel ?? ''] ?? String(channel ?? '-');

const formatDaysLabel = (days: number[] = []) => {
  const set = new Set(days);
  return DAY_OPTIONS.filter((d) => set.has(d.value)).map((d) => d.label).join(', ');
};

export function ProductV2EditorPage({ mode = 'product' }: ProductV2EditorPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isComboMode = mode === 'combo';

  const initialTab = (searchParams.get('tab') as TabKey) || 'geral';
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [isLoading, setIsLoading] = useState(true);
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [savingStates, setSavingStates] = useState<Record<string, boolean>>({});
  const [pizzaPrices, setPizzaPrices] = useState<Record<string, number>>({});

  const isNew = id === 'new' || !id;
  const productId = isNew ? '' : id;
  const isComboWizard = isComboMode && isNew;
  const isProductWizard = !isComboMode && isNew;
  const comboWizardIndex = COMBO_WIZARD_TABS.indexOf(tab);
  const productWizardIndex = PRODUCT_WIZARD_TABS.indexOf(tab);

  const goNextWizardStep = () => {
    if (isComboWizard) {
      const nextIndex = Math.min(comboWizardIndex + 1, COMBO_WIZARD_TABS.length - 1);
      setTab(COMBO_WIZARD_TABS[nextIndex]);
    } else if (isProductWizard) {
      const nextIndex = Math.min(productWizardIndex + 1, PRODUCT_WIZARD_TABS.length - 1);
      setTab(PRODUCT_WIZARD_TABS[nextIndex]);
    }
  };

  const goPrevWizardStep = () => {
    if (isComboWizard) {
      const prevIndex = Math.max(comboWizardIndex - 1, 0);
      setTab(COMBO_WIZARD_TABS[prevIndex]);
    } else if (isProductWizard) {
      const prevIndex = Math.max(productWizardIndex - 1, 0);
      setTab(PRODUCT_WIZARD_TABS[prevIndex]);
    }
  };

  const [productForm, setProductForm] = useState<CreateProductDto>({
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
    costPrice: 0,
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
  const [bundleItems, setBundleItems] = useState<BundleItemWithProduct[]>([]);
  const [bundleSummary, setBundleSummary] = useState<{
    subtotal: number;
    discountTotal: number;
    finalPrice: number;
    pricingType: ComboPricingType;
    pricingValue: number;
  } | null>(null);
  const [comboPricingType, setComboPricingType] = useState<ComboPricingType>('fixed_price');
  const [comboPricingValue, setComboPricingValue] = useState(0);
  const [comboModeState, setComboModeState] = useState<'bundle' | 'slot'>('bundle');
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
  const [isBundleItemModalOpen, setIsBundleItemModalOpen] = useState(false);
  const [editingBundleItem, setEditingBundleItem] = useState<BundleItemWithProduct | null>(null);
  const [bundleItemForm, setBundleItemForm] = useState<CreateComboBundleItemDto>({
    comboProductId: productId,
    productId: '',
    qty: 1,
    sortOrder: 0,
  });

  // Upsells
  const [allUpsells, setAllUpsells] = useState<Upsell[]>([]);
  const [productUpsells, setProductUpsells] = useState<string[]>([]);

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
  const [ruleChannels, setRuleChannels] = useState<Array<'storefront_delivery' | 'storefront_pickup' | 'pos'>>(['storefront_delivery']);

  // Technical Hygiene: Modals/Toasts
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string } | null>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      // Carregar categorias sempre
      const catRes = await api.get<ProductCategory[]>('/catalog/categories');
      if (catRes.success) setCategories(catRes.data);

      if (isNew) {
        setIsLoading(false);
        return;
      }

      const [prodRes, linksRes, groupsRes, pubRes, rulesRes] = await Promise.all([
        api.get<ProductDetails>(`/catalog/products/${productId}`),
        api.get<LinkWithGroup[]>(`/catalog/products/${productId}/option-groups`),
        api.get<Array<OptionGroup & { items?: Array<{ id: string; name: string }> }>>('/catalog/option-groups'),
        api.get<CatalogPublication>(`/catalog/products/${productId}/publication`),
        api.get<CatalogAvailabilityRule[]>(`/catalog/products/${productId}/publication/rules`),
      ]);

      if (prodRes.success) {
        setProduct(prodRes.data);
        setComboModeState(prodRes.data.comboMode ?? 'bundle');
        setComboPricingType(prodRes.data.comboPricingType ?? 'fixed_price');
        setComboPricingValue(Number(prodRes.data.comboPricingValue ?? prodRes.data.basePrice ?? 0));
        if (prodRes.data.optionItemPrices) {
          const pricesMap: Record<string, number> = {};
          prodRes.data.optionItemPrices.forEach((p) => {
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
          costPrice: Number(prodRes.data.costPrice ?? 0),
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
        const isBundleCombo = (prodRes.data.comboMode ?? 'bundle') === 'bundle';
        try {
          const slotsRes = await api.get<SlotWithAllowed[]>(`/catalog/products/${productId}/combo-slots`);
          if (slotsRes.success) setSlots(slotsRes.data);
        } catch (error) {
          console.warn('Não foi possível carregar combo-slots:', error);
          setSlots([]);
        }
        if (isBundleCombo) {
          try {
            const [bundleRes, summaryRes] = await Promise.all([
              api.get<BundleItemWithProduct[]>(`/catalog/products/${productId}/bundle-items`),
              api.get<BundleSummary>(`/catalog/products/${productId}/bundle-items/summary`),
            ]);
            if (bundleRes.success) setBundleItems(bundleRes.data);
            if (summaryRes.success) {
              setBundleSummary({
                subtotal: Number(summaryRes.data.subtotal ?? 0),
                discountTotal: Number(summaryRes.data.discountTotal ?? 0),
                finalPrice: Number(summaryRes.data.finalPrice ?? 0),
                pricingType: summaryRes.data.pricingType ?? 'fixed_price',
                pricingValue: Number(summaryRes.data.pricingValue ?? 0),
              });
              setComboPricingType(summaryRes.data.pricingType ?? 'fixed_price');
              setComboPricingValue(Number(summaryRes.data.pricingValue ?? 0));
            }
          } catch (error) {
            console.warn('Não foi possível carregar itens do bundle:', error);
            setBundleItems([]);
            setBundleSummary(null);
          }
        } else {
          setBundleItems([]);
          setBundleSummary({
            subtotal: 0,
            discountTotal: 0,
            finalPrice: Number(prodRes.data.basePrice ?? 0),
            pricingType: 'fixed_price',
            pricingValue: Number(prodRes.data.basePrice ?? 0),
          });
        }
      } else {
        setSlots([]);
        setBundleItems([]);
        setBundleSummary(null);
      }

      if (pubRes.success) {
        setPublication(pubRes.data);
      }
      if (rulesRes.success) setRules(rulesRes.data);

      const [allUpsellsRes, prodUpsellsRes] = await Promise.all([
        api.get<Upsell[]>('/upsells'),
        id && id !== 'new' ? api.get<Upsell[]>(`/catalog/products/${id}/upsells`) : Promise.resolve({ success: true, data: [] as Upsell[] }),
      ]);
      if (allUpsellsRes.success) setAllUpsells(allUpsellsRes.data);
      if (prodUpsellsRes.success) setProductUpsells(prodUpsellsRes.data.map((u) => u.id));
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
    if (!productForm.name || (!isComboMode && !productForm.basePrice)) {
      setAlertModal({ isOpen: true, title: 'Atenção', message: isComboMode ? 'Nome é obrigatório.' : 'Nome e preço são obrigatórios.' });
      return;
    }
    setSavingStates((p) => ({ ...p, saveProduct: true }));
    try {
      let finalImageUrl: string | undefined = productForm.image;

      if (imageFile) {
        const fd = new FormData();
        fd.append('file', imageFile);
        const uploadType = isComboMode ? 'combo' : 'product';
        const uploadRes = await api.upload<{ url: string }>(`/upload/image?type=${uploadType}`, fd);
        if (uploadRes.success) {
          finalImageUrl = uploadRes.data.url;
        }
      }

      const payload = {
        ...productForm,
        categoryId: productForm.categoryId ? productForm.categoryId : null,
        type: isComboMode ? 'combo' : productForm.type,
        costPrice: Number(productForm.costPrice || 0),
        image: finalImageUrl,
        optionItemPrices: Object.entries(pizzaPrices).map(([optionItemId, price]) => ({
          optionItemId,
          price
        }))
      };

      if (isNew) {
        const res = await api.post<Product>('/catalog/products', payload);
        if (res.success) {
          if (isComboMode) {
            // Para wizard de combo, continua para o próximo passo (aba combo)
            navigate(`/catalog/combos/${res.data.id}/v2?tab=combo`, { replace: true });
          } else {
            // Para wizard de produto, continua para personalização
            navigate(`/catalog/products/${res.data.id}/v2?tab=personalizacao`, { replace: true });
          }
        }
      } else {
        const res = await api.patch<ProductDetails>(`/catalog/products/${productId}`, payload);
        if (res.success) {
          setProduct(res.data);
          if (isComboMode) {
            navigate('/catalog/combos');
          } else {
            setAlertModal({ isOpen: true, title: 'Sucesso', message: 'Produto salvo com sucesso!' });
            setTimeout(() => navigate('/catalog/products'), 1500);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      setAlertModal({ isOpen: true, title: 'Erro', message: 'Erro ao salvar produto.' });
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
  const selectableBundleProducts = useMemo(() => {
    return allowedProducts.filter((p) => p.isActive);
  }, [allowedProducts]);

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
      if (!productId) throw new Error('productId não disponível');
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

      if (!productId) throw new Error('productId não disponível');
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
    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Remoção',
      message: 'Remover este grupo do produto?',
      onConfirm: async () => {
        setConfirmModal(null);
        setSavingStates((p) => ({ ...p, [`remove-${linkId}`]: true }));
        try {
          if (!productId) throw new Error('productId não disponível');
          await api.delete(`/catalog/products/${productId}/option-groups/${linkId}`);
          await loadAll();
        } finally {
          setSavingStates((p) => ({ ...p, [`remove-${linkId}`]: false }));
        }
      }
    });
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
      if (!productId) throw new Error('productId não disponível');
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
      if (!productId) throw new Error('productId não disponível');
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
        if (!productId) throw new Error('productId não disponível');
      await api.patch(`/catalog/products/${productId}/combo-slots/${editingSlot.id}`, upd);
      } else {
        if (!productId) throw new Error('productId não disponível');
      await api.post(`/catalog/products/${productId}/combo-slots`, payload);
      }

      setIsSlotModalOpen(false);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, saveSlot: false }));
    }
  };

  const deleteSlot = async (slotId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Exclusão',
      message: 'Excluir este slot do combo?',
      onConfirm: async () => {
        setConfirmModal(null);
        setSavingStates((p) => ({ ...p, [`delete-slot-${slotId}`]: true }));
        try {
          if (!productId) throw new Error('productId não disponível');
          await api.delete(`/catalog/products/${productId}/combo-slots/${slotId}`);
          await loadAll();
        } finally {
          setSavingStates((p) => ({ ...p, [`delete-slot-${slotId}`]: false }));
        }
      }
    });
  };

  const reorderSlots = async (orderedSlotIds: string[]) => {
    setSavingStates((p) => ({ ...p, reorderSlots: true }));
    try {
      if (!productId) throw new Error('productId não disponível');
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
        if (!allowedTargetSlotId || !editingAllowed?.id) throw new Error('Parâmetros inválidos');
      await api.patch(
        `/catalog/products/${productId}/combo-slots/${allowedTargetSlotId}/allowed-items/${editingAllowed.id}`,
        upd,
      );
      } else {
        if (!allowedTargetSlotId) throw new Error('allowedTargetSlotId não disponível');
      await api.post(`/catalog/products/${productId}/combo-slots/${allowedTargetSlotId}/allowed-items`, payload);
      }

      setIsAllowedModalOpen(false);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, saveAllowed: false }));
    }
  };

  const deleteAllowed = async (slotId: string, idToDelete: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Exclusão',
      message: 'Excluir este item permitido?',
      onConfirm: async () => {
        setConfirmModal(null);
        setSavingStates((p) => ({ ...p, [`delete-allowed-${idToDelete}`]: true }));
        try {
          if (!productId) throw new Error('productId não disponível');
          await api.delete(`/catalog/products/${productId}/combo-slots/${slotId}/allowed-items/${idToDelete}`);
          await loadAll();
        } finally {
          setSavingStates((p) => ({ ...p, [`delete-allowed-${idToDelete}`]: false }));
        }
      }
    });
  };

  const reorderAllowed = async (slotId: string, orderedAllowedItemIds: string[]) => {
    setSavingStates((p) => ({ ...p, [`reorder-allowed-${slotId}`]: true }));
    try {
      if (!productId) throw new Error('productId não disponível');
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

  const openBundleItemModal = async (item?: BundleItemWithProduct) => {
    await loadProductsIfNeeded();
    if (item) {
      setEditingBundleItem(item);
      setBundleItemForm({
        comboProductId: productId,
        productId: item.productId,
        qty: Math.max(1, item.qty),
        sortOrder: item.sortOrder,
      });
    } else {
      setEditingBundleItem(null);
      setBundleItemForm({
        comboProductId: productId,
        productId: selectableBundleProducts[0]?.id ?? '',
        qty: 1,
        sortOrder: bundleItems.length,
      });
    }
    setIsBundleItemModalOpen(true);
  };

  const saveBundleItem = async () => {
    if (!productId) return;
    setSavingStates((p) => ({ ...p, saveBundleItem: true }));
    try {
      const payload: Omit<CreateComboBundleItemDto, 'comboProductId'> = {
        productId: bundleItemForm.productId,
        qty: Math.max(1, Number(bundleItemForm.qty ?? 1)),
        sortOrder: Number(bundleItemForm.sortOrder ?? 0),
      };
      if (editingBundleItem) {
        const upd: UpdateComboBundleItemDto = {
          qty: payload.qty,
          sortOrder: payload.sortOrder,
        };
        if (!productId) throw new Error('productId não disponível');
      await api.patch(`/catalog/products/${productId}/bundle-items/${editingBundleItem.id}`, upd);
      } else {
        if (!productId) throw new Error('productId não disponível');
      await api.post(`/catalog/products/${productId}/bundle-items`, payload);
      }
      setIsBundleItemModalOpen(false);
      await loadAll();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Não foi possível salvar item do combo.';
      alert(msg);
    } finally {
      setSavingStates((p) => ({ ...p, saveBundleItem: false }));
    }
  };

  const deleteBundleItem = async (idToDelete: string) => {
    if (!window.confirm('Remover este item do combo?')) return;
    setSavingStates((p) => ({ ...p, [`delete-bundle-${idToDelete}`]: true }));
    try {
      if (!productId) throw new Error('productId não disponível');
      await api.delete(`/catalog/products/${productId}/bundle-items/${idToDelete}`);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, [`delete-bundle-${idToDelete}`]: false }));
    }
  };

  const updateComboPricing = async () => {
    if (!productId) return;
    setSavingStates((p) => ({ ...p, updateComboPricing: true }));
    try {
      if (!productId) throw new Error('productId não disponível');
      await api.patch(`/catalog/products/${productId}`, {
        comboPricingType,
        comboPricingValue,
      });
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, updateComboPricing: false }));
    }
  };

  const convertComboToBundle = async () => {
    if (!productId) return;
    setSavingStates((p) => ({ ...p, convertBundle: true }));
    try {
      if (!productId) throw new Error('productId não disponível');
      await api.patch(`/catalog/products/${productId}`, {
        comboMode: 'bundle',
        comboPricingType: comboPricingType ?? 'fixed_price',
        comboPricingValue: Number(comboPricingValue || productForm.basePrice || 0),
      });
      await loadAll();
      alert('Combo convertido para modo bundle com sucesso.');
    } finally {
      setSavingStates((p) => ({ ...p, convertBundle: false }));
    }
  };

  // -------------------- Publicação handlers --------------------

  const patchPublication = async (payload: UpsertPublicationDto) => {
    setSavingStates((p) => ({ ...p, patchPublication: true }));
    try {
      if (!productId) throw new Error('productId não disponível');
      const res = await api.patch<CatalogPublication>(`/catalog/products/${productId}/publication`, payload);
      if (res.success) {
        setPublication(res.data);
      }
    } finally {
      setSavingStates((p) => ({ ...p, patchPublication: false }));
    }
  };

  const openRuleModal = (rule?: CatalogAvailabilityRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleChannels([rule.channel as 'storefront_delivery' | 'storefront_pickup' | 'pos']);
      setRuleForm({
        channel: rule.channel,
        daysOfWeek: rule.daysOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        isActive: rule.isActive,
      });
    } else {
      setEditingRule(null);
      setRuleChannels(['storefront_delivery']);
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
        if (!productId) throw new Error('productId não disponível');
      await api.patch(`/catalog/products/${productId}/publication/rules/${editingRule.id}`, upd);
      } else {
        const channelsToCreate = ruleChannels.length > 0 ? ruleChannels : ['storefront_delivery'];
        await Promise.all(
          channelsToCreate.map((channel) => {
            const create: CreateAvailabilityRuleDto = {
              ...ruleForm,
              channel: channel as CreateAvailabilityRuleDto['channel'],
            };
            if (!productId) throw new Error('productId não disponível');
            return api.post(`/catalog/products/${productId}/publication/rules`, create);
          }),
        );
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
      if (!productId) throw new Error('productId não disponível');
      await api.delete(`/catalog/products/${productId}/publication/rules/${ruleId}`);
      await loadAll();
    } finally {
      setSavingStates((p) => ({ ...p, [`delete-rule-${ruleId}`]: false }));
    }
  };

  const toggleProductUpsell = async (upsellId: string) => {
    if (isNew) return;
    const isLinked = productUpsells.includes(upsellId);
    try {
      if (isLinked) {
        if (!productId) throw new Error('productId não disponível');
      await api.delete(`/upsells/${upsellId}/link/${productId}`);
      } else {
        if (!productId) throw new Error('productId não disponível');
      await api.post(`/upsells/${upsellId}/link/${productId}`);
      }
      setProductUpsells(prev => isLinked ? prev.filter(id => id !== upsellId) : [...prev, upsellId]);
    } catch (error) {
      console.error('Error toggling upsell:', error);
    }
  };

  if (!productId && !isNew) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="font-black text-foreground">Produto inválido.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto text-left">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-foreground truncate">
            {isNew ? (isComboMode ? 'Novo Combo' : 'Novo Produto') : (isComboMode ? 'Editor de Combo' : 'Editor de Produto')}
          </h1>
          <p className="text-muted-foreground mt-1 truncate">
            {isNew
              ? (isComboMode ? 'Crie a base do combo para iniciar a montagem' : 'Preencha as informações básicas para começar')
              : (product?.name ?? 'Carregando...')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(isComboMode ? '/catalog/combos' : '/catalog/products')}
            className="px-4 py-2 text-sm font-bold text-foreground bg-card border border-border hover:bg-muted rounded-xl transition-all"
          >
            Voltar
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-2 shadow-sm mb-4 sm:mb-6 flex gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('geral')}
          className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab === 'geral' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
        >
          {(isComboWizard || isProductWizard) ? '1. Informações Gerais' : 'Informações Gerais'}
          <InfoTooltip text="Nome, categoria, preço base e descrição do item." />
        </button>
        {!isComboMode && (
          <button
            type="button"
            onClick={() => setTab('personalizacao')}
            disabled={isProductWizard && productWizardIndex < 1}
            className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab === 'personalizacao' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed'}`}
          >
            {isProductWizard ? '2. Complementos' : 'Complementos'}
            <InfoTooltip text="Adicione grupos de opções como adicionais, tamanhos ou ingredientes." />
          </button>
        )}
        {isComboMode && (
          <button
            type="button"
            onClick={() => setTab('combo')}
            disabled={isComboWizard && comboWizardIndex < 1}
            className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab === 'combo' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed'}`}
          >
            {isComboWizard ? '2. Itens do Combo' : 'Itens do Combo'}
            <InfoTooltip text="Defina os produtos que podem ser escolhidos neste combo." />
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab('vendas')}
          disabled={isNew}
          className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab === 'vendas' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed'}`}
        >
          {isComboWizard ? '3. Upsells' : 'Upsells / Ofertas'}
          <InfoTooltip text="Configurar sugestões de venda (compre também) para este produto." />
        </button>
        <button
          type="button"
          onClick={() => setTab('publicacao')}
          disabled={(isComboWizard && comboWizardIndex < 2) || (isProductWizard && productWizardIndex < 2)}
          className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${tab === 'publicacao' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed'}`}
        >
          {isComboWizard ? '4. Disponibilidade' : (isProductWizard ? '3. Disponibilidade' : 'Disponibilidade')}
          <InfoTooltip text="Controle em quais horários e canais (Delivery, Balcão) este item está ativo." />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {tab === 'geral' && (
            <ProductBasicInfo
              product={product}
              productForm={productForm}
              setProductForm={setProductForm}
              categories={categories}
              isComboMode={isComboMode}
              bundleSummary={bundleSummary}
              imagePreviewUrl={imagePreviewUrl}
              handleSelectImageFile={handleSelectImageFile}
              setImageFile={setImageFile}
              setImagePreviewUrl={setImagePreviewUrl}
              pizzaPrices={pizzaPrices}
              setPizzaPrices={setPizzaPrices}
              isComboWizard={isComboWizard}
              goNextWizardStep={goNextWizardStep}
              handleSaveProduct={handleSaveProduct}
              savingStates={savingStates}
              isNew={isNew}
              onOpenRecipe={() => setIsRecipeModalOpen(true)}
            />
          )}

          {tab === 'personalizacao' && (
            <ProductPersonalization
              isComboMode={isComboMode}
              links={links}
              moveLink={moveLink}
              openAddGroupModal={openAddGroupModal}
              setIsCreateComplementModalOpen={setIsCreateComplementModalOpen}
              openEditLinkModal={openEditLinkModal}
              removeGroupLink={removeGroupLink}
              savingStates={savingStates}
              isProductWizard={isProductWizard}
              goPrevWizardStep={goPrevWizardStep}
              goNextWizardStep={goNextWizardStep}
            />
          )}

          {tab === 'combo' && (
            <ComboBuilder
              productForm={productForm}
              bundleItems={bundleItems}
              bundleSummary={bundleSummary}
              comboModeState={comboModeState}
              comboPricingType={comboPricingType}
              setComboPricingType={setComboPricingType}
              comboPricingValue={comboPricingValue}
              setComboPricingValue={setComboPricingValue}
              updateComboPricing={updateComboPricing}
              openBundleItemModal={openBundleItemModal}
              deleteBundleItem={deleteBundleItem}
              convertComboToBundle={convertComboToBundle}
              isComboWizard={isComboWizard}
              goNextWizardStep={goNextWizardStep}
              slots={slots}
              moveSlot={moveSlot}
              openAllowedModal={openAllowedModal}
              openSlotModal={openSlotModal}
              deleteSlot={deleteSlot}
              moveAllowed={moveAllowed}
              deleteAllowed={deleteAllowed}
              savingStates={savingStates}
            />
          )}

          {tab === 'vendas' && (
            <div className="space-y-6">
              <div className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-black text-foreground">Vincular Upsells</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-6 font-medium">
                  Selecione quais ofertas de Upsell devem aparecer quando este produto for selecionado ou estiver no carrinho. 
                  Configure as ofertas na página de <span className="text-primary font-bold underline cursor-pointer" onClick={() => navigate('/catalog/upsells')}>Upsells</span>.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allUpsells.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-2">
                      <Sparkles className="h-8 w-8 text-muted-foreground" />
                      <span className="font-bold">Nenhuma oferta cadastrada.</span>
                    </div>
                  ) : (
                    allUpsells.map(u => {
                       const isSelected = productUpsells.includes(u.id);
                       return (
                         <div 
                           key={u.id}
                           onClick={() => toggleProductUpsell(u.id)}
                           className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                             isSelected 
                               ? 'border-primary bg-primary/10 shadow-sm' 
                               : 'border-border hover:border-border/75 bg-card'
                           }`}
                         >
                           <div className="flex items-center justify-between mb-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                u.pricingType === 'fixed_price' ? 'bg-status-warning/10 text-status-warning border border-status-warning/20' :
                                u.pricingType.startsWith('discount') ? 'bg-status-success/10 text-status-success border border-status-success/20' :
                                'bg-muted text-muted-foreground border border-border'
                              }`}>
                                {u.pricingType === 'normal' ? 'Preço Normal' : 
                                 u.pricingType === 'fixed_price' ? 'Fixo' :
                                 u.pricingType === 'discount_percent' ? `${u.pricingValue}% Desc.` :
                                 `R$${u.pricingValue} Desc.`}
                              </span>
                              {isSelected && <div className="h-4 w-4 bg-primary rounded-full flex items-center justify-center">
                                <Plus className="h-3 w-3 text-primary-foreground rotate-45" />
                              </div>}
                           </div>
                           <div className="font-bold text-foreground">{u.name}</div>
                           <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{u.description}</div>
                         </div>
                       );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'publicacao' && (
            <PublicationSettings
              publication={publication}
              patchPublication={patchPublication}
              rules={rules}
              openRuleModal={openRuleModal}
              deleteRule={deleteRule}
              formatChannelLabel={formatChannelLabel}
              formatDaysLabel={formatDaysLabel}
              isComboWizard={isComboWizard}
              isProductWizard={isProductWizard}
              goPrevWizardStep={goPrevWizardStep}
              handleSaveProduct={handleSaveProduct}
              savingStates={savingStates}
            />
          )}
        </>
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
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={addGroupLink}
              disabled={savingStates.addGroupLink || availableGroupsToAdd.length === 0}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.addGroupLink && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
              Vincular
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {availableGroupsToAdd.length > 0 ? (
            <>
              <div className="text-sm text-muted-foreground font-bold">Selecione um complemento</div>
              <select
                value={selectedGroupIdToAdd}
                onChange={(e) => setSelectedGroupIdToAdd(e.target.value)}
                className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
              >
                {availableGroupsToAdd.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <div className="text-sm text-muted-foreground font-bold italic p-4 text-center">
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
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={createComplementAndLink}
              disabled={savingStates.createComplementAndLink || !newComplementForm.name.trim()}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.createComplementAndLink && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
              Criar e vincular
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Nome</label>
            <input
              value={newComplementForm.name}
              onChange={(e) => setNewComplementForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
              placeholder="Ex: Molhos e adicionais"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Tipo de seleção</label>
            <select
              value={newComplementForm.selectionType}
              onChange={(e) => setNewComplementForm((p) => ({ ...p, selectionType: e.target.value as 'single' | 'multiple' | 'quantity' }))}
              className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="single">Escolha única</option>
              <option value="multiple">Múltipla escolha</option>
              <option value="quantity">Por quantidade</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Mínimo</label>
              <input
                type="number"
                value={newComplementForm.minSelect}
                onChange={(e) => setNewComplementForm((p) => ({ ...p, minSelect: Number(e.target.value || 0) }))}
                className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Máximo</label>
              <input
                type="number"
                value={newComplementForm.maxSelect}
                onChange={(e) => setNewComplementForm((p) => ({ ...p, maxSelect: Number(e.target.value || 1) }))}
                className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newComplementForm.isRequired}
              onChange={(e) => setNewComplementForm((p) => ({ ...p, isRequired: e.target.checked }))}
              className="w-4 h-4 rounded text-primary border-input focus:ring-primary"
            />
            <span className="text-sm font-bold text-foreground">Obrigatório</span>
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={isBundleItemModalOpen}
        onClose={() => setIsBundleItemModalOpen(false)}
        title={editingBundleItem ? 'Editar item do combo' : 'Adicionar item do cardápio'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsBundleItemModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveBundleItem}
              disabled={savingStates.saveBundleItem || !bundleItemForm.productId || selectableBundleProducts.length === 0 || comboModeState !== 'bundle'}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveBundleItem && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
              Salvar item
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Produto do cardápio</label>
            <select
              value={bundleItemForm.productId}
              onChange={(e) => setBundleItemForm((p) => ({ ...p, productId: e.target.value }))}
              className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
            >
              {selectableBundleProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {selectableBundleProducts.length === 0 ? (
              <p className="text-xs text-status-warning mt-2 font-bold uppercase tracking-wider">Não há produtos ativos disponíveis para vínculo.</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Quantidade</label>
              <input
                type="number"
                min={1}
                value={Number(bundleItemForm.qty ?? 1)}
                onChange={(e) => setBundleItemForm((p) => ({ ...p, qty: Math.max(1, Number(e.target.value || 1)) }))}
                className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Ordem</label>
              <input
                type="number"
                min={0}
                value={Number(bundleItemForm.sortOrder ?? 0)}
                onChange={(e) => setBundleItemForm((p) => ({ ...p, sortOrder: Math.max(0, Number(e.target.value || 0)) }))}
                className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
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
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveLinkOverrides}
              disabled={savingStates.saveLinkOverrides}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveLinkOverrides && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Pricing Axis</label>
            <select
              value={(linkForm.pricingAxis as string) ?? 'secondary'}
              onChange={(e) => setLinkForm((p) => ({ ...p, pricingAxis: e.target.value as 'primary' | 'secondary' }))}
              className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
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
              className="w-4 h-4 rounded text-primary border-input focus:ring-primary"
            />
            <span className="text-sm font-bold text-foreground">Override required</span>
            <button
              type="button"
              onClick={() => setLinkForm((p) => ({ ...p, overrideIsRequired: undefined }))}
              className="ml-auto text-xs font-black text-muted-foreground hover:text-foreground transition-colors"
            >
              limpar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Override min</label>
              <input
                type="number"
                value={linkForm.overrideMinSelect ?? ''}
                onChange={(e) => setLinkForm((p) => ({ ...p, overrideMinSelect: e.target.value === '' ? undefined : Number(e.target.value) }))}
                className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Override max</label>
              <input
                type="number"
                value={linkForm.overrideMaxSelect ?? ''}
                onChange={(e) => setLinkForm((p) => ({ ...p, overrideMaxSelect: e.target.value === '' ? undefined : Number(e.target.value) }))}
                className="w-full px-4 py-2.5 bg-card text-foreground border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary"
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
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveSlot}
              disabled={savingStates.saveSlot}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveSlot && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Nome</label>
            <input
              value={slotForm.name}
              onChange={(e) => setSlotForm((p) => ({ ...p, name: e.target.value }))}
              className="input-premium"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Descrição</label>
            <input
              value={slotForm.description ?? ''}
              onChange={(e) => setSlotForm((p) => ({ ...p, description: e.target.value }))}
              className="input-premium"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(slotForm.isRequired)}
              onChange={(e) => setSlotForm((p) => ({ ...p, isRequired: e.target.checked }))}
              className="w-4 h-4 text-primary-600"
            />
            <span className="text-sm font-bold text-foreground">Obrigatório</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Min</label>
              <input
                type="number"
                value={Number(slotForm.minSelect ?? 1)}
                onChange={(e) => setSlotForm((p) => ({ ...p, minSelect: Number(e.target.value || 1) }))}
                className="input-premium"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Max</label>
              <input
                type="number"
                value={Number(slotForm.maxSelect ?? 1)}
                onChange={(e) => setSlotForm((p) => ({ ...p, maxSelect: Number(e.target.value || 1) }))}
                className="input-premium"
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
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveAllowed}
              disabled={savingStates.saveAllowed}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveAllowed && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
              {editingAllowed ? 'Salvar' : 'Adicionar'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Produto</label>
            <select
              value={allowedForm.productId}
              onChange={(e) => setAllowedForm((p) => ({ ...p, productId: e.target.value }))}
              className="input-premium"
            >
              {allowedProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Preço adicional</label>
            <input
              type="number"
              step="0.01"
              value={Number(allowedForm.additionalPrice ?? 0)}
              onChange={(e) => setAllowedForm((p) => ({ ...p, additionalPrice: Number(e.target.value || 0) }))}
              className="input-premium"
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
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveRule}
              disabled={savingStates.saveRule}
              className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingStates.saveRule && <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Canal</label>
            {editingRule ? (
              <select
                value={ruleForm.channel}
                onChange={(e) => setRuleForm((p) => ({ ...p, channel: e.target.value as CreateAvailabilityRuleDto['channel'] }))}
                className="input-premium"
              >
                <option value="storefront_delivery">Delivery</option>
                <option value="storefront_pickup">Retirada</option>
                <option value="pos">Balcao / PDV</option>
              </select>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(Object.entries(CHANNEL_LABELS) as Array<[string, string]>).map(([value, label]) => {
                  const checked = ruleChannels.includes(value as 'storefront_delivery' | 'storefront_pickup' | 'pos');
                  return (
                    <label key={value} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 dark:bg-muted/80 px-3 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const current = new Set(ruleChannels);
                          if (e.target.checked) current.add(value as 'storefront_delivery' | 'storefront_pickup' | 'pos');
                          else current.delete(value as 'storefront_delivery' | 'storefront_pickup' | 'pos');
                          setRuleChannels(Array.from(current));
                        }}
                        className="w-4 h-4 text-primary-600"
                      />
                      <span className="text-xs font-bold text-foreground">{label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-2">Dias da semana</label>
            <div className="grid grid-cols-2 gap-2">
              {DAY_OPTIONS.map((day) => {
                const isChecked = (ruleForm.daysOfWeek ?? []).includes(day.value);
                return (
                  <label key={day.value} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 dark:bg-muted/80 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const current = new Set(ruleForm.daysOfWeek ?? []);
                        if (e.target.checked) {
                          current.add(day.value);
                        } else {
                          current.delete(day.value);
                        }
                        setRuleForm((p) => ({ ...p, daysOfWeek: Array.from(current) }));
                      }}
                      className="w-4 h-4 text-primary-600"
                    />
                    <span className="text-xs font-bold text-foreground">{day.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Início</label>
              <input
                value={ruleForm.startTime}
                onChange={(e) => setRuleForm((p) => ({ ...p, startTime: e.target.value }))}
                className="input-premium"
                placeholder="HH:MM"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-muted-foreground uppercase tracking-wider mb-1.5">Fim</label>
              <input
                value={ruleForm.endTime}
                onChange={(e) => setRuleForm((p) => ({ ...p, endTime: e.target.value }))}
                className="input-premium"
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
            <span className="text-sm font-bold text-foreground">Ativa</span>
          </div>
        </div>
      </Modal>

      {confirmModal && (
        <Modal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(null)}
          title={confirmModal.title}
          footer={
            <>
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-6 py-2 bg-destructive text-destructive-foreground rounded-xl font-bold hover:bg-destructive/90"
              >
                Confirmar
              </button>
            </>
          }
        >
          <p className="text-muted-foreground">{confirmModal.message}</p>
        </Modal>
      )}

      {alertModal && (
        <Modal
          isOpen={true}
          onClose={() => setAlertModal(null)}
          title={alertModal.title}
          footer={
            <button
              onClick={() => setAlertModal(null)}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-bold"
            >
              OK
            </button>
          }
        >
          <p className="text-muted-foreground">{alertModal.message}</p>
        </Modal>
      )}
      {product && (
        <RecipeModal
          isOpen={isRecipeModalOpen}
          onClose={() => {
            setIsRecipeModalOpen(false);
            loadAll();
          }}
          entityType={isComboMode ? 'combo' : 'product'}
          entityId={product.id}
          entityName={product.name}
        />
      )}
    </div>
  );
}
