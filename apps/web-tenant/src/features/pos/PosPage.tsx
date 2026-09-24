import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/api-client';
import { printThermalText } from '@/lib/thermal-print';
import { useActiveSession } from '../cash/hooks/useCashSession';
import { useCreatePosSale, type PosCreateSalePayload } from './hooks/usePosSale';
import { useDraftSale } from './hooks/useDraftSale';
import { PosFulfillmentType, PaymentMethod, OrderResponseDTO } from '@gestor/types';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Users,
  Store,
  ChevronRight,
  Hash,
  X,
  Keyboard,
  LayoutGrid,
  Save,
  Printer,
  Receipt,
  UserPlus,
  Package,
  CircleAlert
} from 'lucide-react';

// New Components
import { OrderTypeSelector } from './components/OrderTypeSelector';
import { ProductCard } from './components/ProductCard';
import { PaymentModal } from './components/PaymentModal';
import { PosSalonView, type SalonTable } from './components/PosSalonView';
import { TransferTableModal } from './components/TransferTableModal';
import { PosItemConfiguratorModal } from './components/PosItemConfiguratorModal';
import { SplitPaymentModal } from './components/SplitPaymentModal';
import { PosCustomerDrawer } from './components/PosCustomerDrawer';
import { getPosFinishBlocker } from './pos-finish-state';
import type { CreateOrderItemSelectionGroupDTO, CreateOrderItemComboSlotSelectionDTO, PizzaCompositionDTO } from '@gestor/types';

interface CatalogProduct {
  id: string;
  name: string;
  basePrice: number;
  image: string | null;
  categoryName: string;
  categoryId: string;
  categoryTemplateType?: string | null;
  type: 'simple' | 'configurable' | 'combo';
}

interface CartItem {
  cartLineId: string;
  lineType: 'product' | 'combo';
  productId?: string;
  comboId?: string;
  name: string;
  basePrice: number;
  quantity: number;
  notes: string;
  selections?: CreateOrderItemSelectionGroupDTO[];
  slots?: CreateOrderItemComboSlotSelectionDTO[];
  pizzaComposition?: PizzaCompositionDTO;
  compositionLabel?: string;
}

interface CustomerResult {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  lastOrderAt?: string | null;
  orderCount: number;
  addresses: CustomerAddress[];
}

interface CustomerAddress {
  id: string;
  label?: string | null;
  street: string;
  number: string;
  neighborhood: string;
  complement?: string | null;
  reference?: string | null;
  zipCode: string;
  city: string;
  state: string;
  lat?: number | null;
  lng?: number | null;
  isDefault: boolean;
}

interface DeliveryRateCalcResponse {
  fee: number;
  rule: {
    id: string;
    type: string;
    description: string;
  };
  resolvedCoordinates?: { lat: number; lng: number };
}

const emptyDeliveryAddress = {
  street: '',
  number: '',
  neighborhood: '',
  complement: '',
  reference: '',
  zipCode: '',
  city: '',
  state: '',
  lat: undefined as number | undefined,
  lng: undefined as number | undefined,
};

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export default function PosPage() {
  const queryClient = useQueryClient();
  const { data: activeSession, isLoading: sessionLoading } = useActiveSession();
  const createSale = useCreatePosSale();
  const upsertDraft = useDraftSale();

  // Navigation Logic
  const [viewMode, setViewMode] = useState<'catalog' | 'salon'>('catalog');

  // Refs for shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Core State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<PosFulfillmentType>(PosFulfillmentType.DINE_IN);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  
  // Mesa Fields
  const [tableNumber, setTableNumber] = useState('');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  
  // Delivery Fields
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryFeeCalculated, setDeliveryFeeCalculated] = useState(false);
  const [deliveryFeeError, setDeliveryFeeError] = useState<string | null>(null);
  const [deliveryFeeRule, setDeliveryFeeRule] = useState<string | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState(emptyDeliveryAddress);

  // Customer Identification
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  // Financials
  const [discountTotal] = useState(0);
  const [saleNotes] = useState('');
  const [couponCode] = useState('');
  const [useCashbackAmount] = useState(0);

  // UI Flow
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [sourceTableForTransfer, setSourceTableForTransfer] = useState<SalonTable | null>(null);

  const [configProductId, setConfigProductId] = useState<string | null>(null);

  const handleTransferTable = useCallback((table: SalonTable) => {
    setSourceTableForTransfer(table);
    setIsTransferModalOpen(true);
  }, []);

  // Printing Utility
  const handlePrint = async (orderId: string, type: 'customer' | 'kitchen') => {
    try {
      const res = await api.get<{ content: string }>(`/pos/sales/${orderId}/print?type=${type}`);
      if (res.success && res.data.content) {
        printThermalText(res.data.content, {
          title: type === 'customer' ? 'Imprimir Cupom' : 'Imprimir Cozinha',
          paperWidthMm: 58,
        });
      }
    } catch (err) {
      // Falha de impressão não deve bloquear o PDV.
    }
  };

  // Queries
  const { data: products } = useQuery<CatalogProduct[]>({
    queryKey: ['posCatalog', searchTerm],
    queryFn: async () => {
      const res = await api.get(`/catalog/products?search=${encodeURIComponent(searchTerm)}&limit=100`);
      const data = res.data as Array<Record<string, unknown>>;
      return (data || []).map((p: Record<string, unknown>) => ({
        id: p['id'] as string,
        name: p['name'] as string,
        basePrice: Number(p['basePrice'] ?? p['base_price'] ?? 0),
        image: (p['image'] as string | null) || null,
        categoryId: ((p['category'] as Record<string, unknown>)?.['id'] as string) || 'uncategorized',
        categoryName: ((p['category'] as Record<string, unknown>)?.['name'] as string) || 'Sem Categoria',
        categoryTemplateType: ((p['category'] as Record<string, unknown>)?.['templateType'] as string) || null,
        type: (p['type'] as 'simple' | 'configurable' | 'combo') || 'simple',
      }));
    },
    refetchOnWindowFocus: false,
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    (products || []).forEach(p => {
      if (p.categoryName) set.add(p.categoryName);
    });
    return ['Todos', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return (products || []).filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'Todos' || p.categoryName === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const { data: salonTables, isLoading: salonLoading } = useQuery<SalonTable[]>({
    queryKey: ['posSalon'],
    queryFn: async () => {
        const res = await api.get('/pos/salon');
        return res.data as SalonTable[];
    },
    enabled: viewMode === 'salon'
  });

  const { data: foundCustomers } = useQuery<CustomerResult[]>({
    queryKey: ['posCustomers', customerSearchTerm],
    queryFn: async () => {
      if (customerSearchTerm.length < 2) return [];
      const res = await api.get<CustomerResult[]>(`/crm/customers/search?q=${encodeURIComponent(customerSearchTerm)}&limit=8`);
      return res.data || [];
    },
    enabled: customerSearchTerm.length >= 2,
  });

  const { data: savedAddresses } = useQuery<CustomerAddress[]>({
    queryKey: ['posCustomerAddresses', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return [];
      const res = await api.get<CustomerAddress[]>(`/crm/customers/${selectedCustomer.id}/addresses`);
      return res.data || [];
    },
    enabled: !!selectedCustomer,
  });

  const createCustomerMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<CustomerResult>('/crm/customers', {
        name: customerName.trim(),
        phone: customerPhone.trim(),
      });
      return { ...res.data, orderCount: 0, addresses: [] };
    },
    onSuccess: (customer) => {
      setSelectedCustomer(customer);
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone);
      setShowCustomerSearch(false);
      void queryClient.invalidateQueries({ queryKey: ['posCustomers'] });
    },
  });

  const createAddressMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const res = await api.post<CustomerAddress>(`/crm/customers/${customerId}/addresses`, {
        ...deliveryAddress,
        city: deliveryAddress.city || 'Nao informado',
        state: deliveryAddress.state || 'NA',
        zipCode: deliveryAddress.zipCode || '00000000',
        isDefault: true,
      });
      return res.data;
    },
    onSuccess: (address) => {
      setSelectedAddressId(address.id);
      setEditingAddressId(null);
      void queryClient.invalidateQueries({ queryKey: ['posCustomerAddresses'] });
      setDeliveryFee(0);
      setDeliveryFeeCalculated(false);
      deliveryRateMutation.mutate(deliveryAddress);
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: async (args: { customerId: string; addressId: string }) => {
      const res = await api.patch<CustomerAddress>(`/crm/customers/${args.customerId}/addresses/${args.addressId}`, {
        ...deliveryAddress,
        city: deliveryAddress.city || 'Nao informado',
        state: deliveryAddress.state || 'NA',
        zipCode: deliveryAddress.zipCode || '00000000',
        isDefault: true,
      });
      return res.data;
    },
    onSuccess: (address) => {
      setSelectedAddressId(address.id);
      setEditingAddressId(null);
      void queryClient.invalidateQueries({ queryKey: ['posCustomerAddresses'] });
      setDeliveryFee(0);
      setDeliveryFeeCalculated(false);
      deliveryRateMutation.mutate(deliveryAddress);
    },
  });

  const deliveryRateMutation = useMutation({
    mutationFn: async (addressForRate: typeof emptyDeliveryAddress) => {
      const res = await api.post<DeliveryRateCalcResponse>('/delivery/rates/calculate-current', {
        address: {
          ...addressForRate,
          city: addressForRate.city || 'Nao informado',
          state: addressForRate.state || 'NA',
          zipCode: addressForRate.zipCode || '00000000',
        },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setDeliveryFee(Math.round(data.fee * 100) / 100);
      setDeliveryFeeCalculated(true);
      setDeliveryFeeError(null);
      setDeliveryFeeRule(data.rule.description);
      if (data.resolvedCoordinates) {
        setDeliveryAddress((prev) => ({
          ...prev,
          lat: data.resolvedCoordinates!.lat,
          lng: data.resolvedCoordinates!.lng,
        }));
      }
    },
    onError: (error) => {
      setDeliveryFee(0);
      setDeliveryFeeCalculated(false);
      setDeliveryFeeRule(null);
      let message = error instanceof Error ? error.message : 'Não foi possível calcular o frete.';
      if (message.includes('422')) {
        message = 'Endereço não localizado (422). Verifique rua, número e cidade.';
      } else if (message.includes('404')) {
        message = 'Serviço de cálculo de frete indisponível (404).';
      }
      setDeliveryFeeError(message);
    },
  });

  useEffect(() => {
    if (fulfillmentType !== PosFulfillmentType.DELIVERY) {
      setDeliveryFee(0);
      setDeliveryFeeCalculated(false);
      setDeliveryFeeError(null);
      setDeliveryFeeRule(null);
    }
  }, [fulfillmentType]);

  const addressesForSelectedCustomer = savedAddresses || selectedCustomer?.addresses || [];

  const resetDeliveryFee = useCallback(() => {
    setDeliveryFee(0);
    setDeliveryFeeCalculated(false);
    setDeliveryFeeError(null);
    setDeliveryFeeRule(null);
  }, []);

  const selectCustomer = useCallback((customer: CustomerResult) => {
    setSelectedCustomer(customer);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setCustomerSearchTerm('');
    setShowCustomerSearch(false);
    setSelectedAddressId(null);
    setDeliveryAddress(emptyDeliveryAddress);
    resetDeliveryFee();
  }, [resetDeliveryFee]);

  const clearSelectedCustomer = useCallback(() => {
    setSelectedCustomer(null);
    setSelectedAddressId(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerSearchTerm('');
    setDeliveryAddress(emptyDeliveryAddress);
    resetDeliveryFee();
  }, [resetDeliveryFee]);

  const applyAddress = (address: CustomerAddress) => {
    const nextAddress = {
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      complement: address.complement || '',
      reference: address.reference || '',
      zipCode: address.zipCode || '',
      city: address.city || '',
      state: address.state || '',
      lat: address.lat || undefined,
      lng: address.lng || undefined,
    };

    setSelectedAddressId(address.id);
    setEditingAddressId(null);
    setDeliveryAddress(nextAddress);
    resetDeliveryFee();
    deliveryRateMutation.mutate(nextAddress);
  };

  const handleSaveCustomerAndAddress = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      setDeliveryFeeError('Informe nome e telefone para salvar o cliente.');
      return;
    }

    try {
      let customer = selectedCustomer;
      if (!customer) {
        customer = await createCustomerMutation.mutateAsync();
      }

      if (isDelivery) {
        if (deliveryMissingRequiredData) {
          setDeliveryFeeError('Informe rua, numero e bairro para salvar o endereco.');
          return;
        }
        if (editingAddressId) {
          await updateAddressMutation.mutateAsync({ customerId: customer.id, addressId: editingAddressId });
        } else {
          await createAddressMutation.mutateAsync(customer.id);
        }
      }
    } catch (error) {
      setDeliveryFeeError(error instanceof Error ? error.message : 'Nao foi possivel salvar cliente/endereco.');
    }
  };


  const addToCart = useCallback((product: CatalogProduct) => {
    // Produtos configuráveis/combos devem passar pelo fluxo de configuração.
    if (product.type === 'configurable' || product.type === 'combo' || product.categoryTemplateType === 'pizza') {
      setConfigProductId(product.id);
      return;
    }

    setCart((prev) => [
      ...prev,
      {
        cartLineId: generateId(),
        lineType: 'product',
        productId: product.id,
        name: product.name,
        basePrice: product.basePrice,
        quantity: 1,
        notes: '',
      },
    ]);
  }, []);

  const updateCartItem = (lineId: string, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((item) => item.cartLineId === lineId ? { ...item, ...updates } : item));
  };

  const removeFromCart = (lineId: string) => {
    setCart((prev) => prev.filter((item) => item.cartLineId !== lineId));
  };

  const handleSelectTable = async (table: SalonTable) => {
     setFulfillmentType(PosFulfillmentType.TABLE);
     setTableNumber(table.name);
     setSelectedTableId(table.id);
     
     if (table.activeOrderId) {
        const res = await api.get<OrderResponseDTO>(`/orders/${table.activeOrderId}`);
        if (res.success && res.data) {
           const order = res.data;
           setCurrentOrderId(order.id);
           setCustomerName(order.customerName);
           setCustomerPhone(order.customerPhone);
           setSelectedCustomer(null);
           setSelectedAddressId(null);
           setCart(order.items.map((it) => ({
             cartLineId: generateId(),
             lineType: it.lineType as 'product' | 'combo',
             productId: it.productId || undefined,
             comboId: it.comboId || undefined,
             name: it.snapshotName,
             basePrice: Number(it.unitPrice),
             quantity: it.quantity,
             notes: it.notes || ''
           })));
        }
     } else {
        setCurrentOrderId(null);
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setSelectedCustomer(null);
        setSelectedAddressId(null);
     }
     setViewMode('catalog');
  };

  const subtotal = cart.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);
  const total = Math.max(0, subtotal - discountTotal + deliveryFee);
  const isDelivery = fulfillmentType === PosFulfillmentType.DELIVERY;
  const customerMissingRequiredData = !customerName.trim() || !customerPhone.trim();
  const deliveryMissingRequiredData =
    isDelivery &&
    (customerMissingRequiredData ||
      !deliveryAddress.street.trim() ||
      !deliveryAddress.number.trim() ||
      !deliveryAddress.neighborhood.trim());
  const canFinalizeSale =
    !!activeSession &&
    cart.length > 0 &&
    !createSale.isPending &&
    !customerMissingRequiredData &&
    (!isDelivery || (!deliveryMissingRequiredData && deliveryFeeCalculated)) &&
    (fulfillmentType !== PosFulfillmentType.TABLE || !!selectedTableId);
  const finishBlocker = useMemo(() => getPosFinishBlocker({
    hasActiveSession: !!activeSession,
    hasItems: cart.length > 0,
    customerMissingRequiredData,
    isDelivery,
    deliveryMissingRequiredData,
    deliveryFeeCalculated,
  }), [activeSession, cart.length, customerMissingRequiredData, deliveryFeeCalculated, deliveryMissingRequiredData, isDelivery]);

  // Keyboard shortcuts mirror the enabled controls; F4 cannot bypass the visible finish gate.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchInputRef.current?.focus(); }
      if (e.key === 'F4' && canFinalizeSale && !isPaymentModalOpen) { e.preventDefault(); setIsPaymentModalOpen(true); }
      if (e.key === 'Escape') {
        if (isPaymentModalOpen) setIsPaymentModalOpen(false);
        if (showCustomerSearch) setShowCustomerSearch(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canFinalizeSale, isPaymentModalOpen, showCustomerSearch]);

  const isSavingCustomerAddress =
    createCustomerMutation.isPending ||
    createAddressMutation.isPending ||
    updateAddressMutation.isPending;

  const updateDeliveryAddress = (field: Exclude<keyof typeof deliveryAddress, 'lat' | 'lng'>, value: string) => {
    setDeliveryAddress((prev) => ({ ...prev, [field]: value }));
      setSelectedAddressId(null);
      setDeliveryFeeError(null);
      if (field === 'street' || field === 'number' || field === 'neighborhood' || field === 'city' || field === 'state' || field === 'zipCode') {
        setDeliveryFee(0);
        setDeliveryFeeCalculated(false);
      }
  };

  const handleCalculateDeliveryFee = () => {
    if (deliveryMissingRequiredData) {
      setDeliveryFeeError('Informe cliente, telefone, rua, numero e bairro para calcular o frete.');
      return;
    }
    deliveryRateMutation.mutate(deliveryAddress);
  };

  const getPayload = (): PosCreateSalePayload & { id?: string } => ({
    id: currentOrderId || undefined,
    idempotencyKey: generateId(),
    items: cart.map((item) => ({
      lineType: item.lineType,
      ...(item.lineType === 'product'
        ? {
            productId: item.productId,

            selections: item.selections,
            pizzaComposition: item.pizzaComposition,
          }
        : {
            // Para combos V2, o backend espera productId quando vier com slots.
            ...(item.slots && item.productId ? { productId: item.productId, slots: item.slots } : { comboId: item.comboId }),
          }),
      quantity: item.quantity,
      notes: item.notes || undefined,
    })),
    customerId: selectedCustomer?.id,
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    fulfillmentType,
    tableId: fulfillmentType === PosFulfillmentType.TABLE ? selectedTableId || undefined : undefined,
    tableNumber: fulfillmentType === PosFulfillmentType.TABLE ? tableNumber : undefined,
    deliveryFee: isDelivery ? deliveryFee : undefined,
    selectedAddressId: isDelivery ? selectedAddressId || undefined : undefined,
    deliveryAddress: isDelivery
      ? {
          ...deliveryAddress,
          city: deliveryAddress.city || 'Nao informado',
          state: deliveryAddress.state || 'NA',
          zipCode: deliveryAddress.zipCode || '00000000',
        }
      : undefined,
    paymentMethod: PaymentMethod.cash, 
    discountTotal: discountTotal > 0 ? discountTotal : undefined,
    notes: saleNotes || undefined,
    couponCode: couponCode || undefined,
    useCashbackAmount: useCashbackAmount || undefined
  });

  const handleSaveDraft = () => {
    if (cart.length === 0) return;
    setSaleError(null);
    upsertDraft.mutate(getPayload(), {
        onSuccess: (data) => {
            setCurrentOrderId(data.id);
            handlePrint(data.id, 'kitchen'); // Print production ticket
            setViewMode('salon');
        },
        onError: (error) => {
            const msg = error instanceof Error ? error.message : 'Erro ao salvar comanda.';
            setSaleError(msg);
        },
    });
  };

  const handleConfirmSale = (method: PaymentMethod) => {
    if (!activeSession) return;
    if (customerMissingRequiredData) {
      setSaleError('Informe nome do cliente e telefone para fechar a conta.');
      return;
    }
    if (isDelivery && deliveryMissingRequiredData) {
      setDeliveryFeeError('Delivery exige cliente, telefone, rua, numero e bairro.');
      return;
    }
    if (isDelivery && !deliveryFeeCalculated) {
      setDeliveryFeeError('Calcule o frete antes de finalizar a venda delivery.');
      return;
    }
    setSaleError(null);
    createSale.mutate({ ...getPayload(), paymentMethod: method }, {
      onSuccess: (data) => {
        handlePrint(data.id, 'customer'); // Auto-print customer receipt
        setCart([]); setCurrentOrderId(null); setTableNumber(''); setSelectedTableId(null); setViewMode('salon'); setIsPaymentModalOpen(false);
        clearSelectedCustomer();
        setDeliveryFee(0); setDeliveryFeeCalculated(false); setDeliveryFeeError(null);
        setSaleError(null);
        toast.success('Venda registrada. Verifique a impressão do comprovante.');
        queryClient.invalidateQueries({ queryKey: ['posSalon'] });
      },
      onError: (error) => {
        setIsPaymentModalOpen(false);
        const msg = error instanceof ApiError && error.status === 401
          ? 'Sessao expirada ou usuario sem autenticacao valida. Faca login novamente e tente finalizar a venda.'
          : error instanceof Error
            ? error.message
            : 'Erro ao finalizar venda.';
        setSaleError(msg);
      },
    });
  };

  if (sessionLoading) return <div className="flex flex-col items-center justify-center h-[100dvh] bg-background text-muted-foreground italic uppercase font-black animate-pulse">Carregando Sessão...</div>;

  return (
    <main className="flex min-h-[calc(100dvh-64px)] flex-col bg-background font-sans text-foreground md:h-[calc(100dvh-64px)] md:flex-row md:overflow-hidden">
      <h1 className="sr-only">Ponto de venda</h1>
      
      {/* ========== LEFT: NAVIGATION ========== */}
      <div className="hidden lg:flex w-16 flex-col bg-card dark:bg-muted900 border-r border-border200 dark:border-border800 py-4 gap-4 items-center">
        <button 
          onClick={() => setViewMode('catalog')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${viewMode === 'catalog' ? 'bg-status-success text-foreground shadow-lg' : 'bg-background dark:bg-muted800 text-foreground/75 hover:bg-muted100 dark:hover:bg-muted700 border border-border/70 dark:border-border700'}`}
          title="Catálogo"
        >
          <Store size={20} />
        </button>
        <button 
          onClick={() => { setViewMode('salon'); queryClient.invalidateQueries({ queryKey: ['posSalon'] }); }}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${viewMode === 'salon' ? 'bg-status-success text-foreground shadow-lg' : 'bg-background dark:bg-muted800 text-foreground/75 hover:bg-muted100 dark:hover:bg-muted700 border border-border/70 dark:border-border700'}`}
          title="Salão"
        >
          <LayoutGrid size={20} />
        </button>
        <div className="w-6 h-[1px] bg-card dark:bg-muted800" />
        <button className="w-10 h-10 bg-background dark:bg-muted800 text-foreground/75 rounded-xl flex items-center justify-center hover:text-foreground transition-colors border border-border/70 dark:border-border700" title="Configurações">
           <Keyboard size={18} />
        </button>
      </div>

      {/* ========== CENTER: CONTENT ========== */}
      <section aria-label="Catálogo e atendimento" className="order-1 flex min-w-0 flex-1 flex-col bg-background md:min-h-0">
        {viewMode === 'catalog' ? (
           <>
             {/* Header Bar: Title, Search, Modalities & Categories */}
             <div className="border-b border-border bg-card p-3.5 sm:p-4 space-y-3">
               <div className="flex items-center justify-between gap-3">
                 <div>
                   <h2 id="pos-catalog-title" className="text-lg font-black text-foreground">PDV</h2>
                   <p className="text-xs font-medium text-muted-foreground">Venda presencial e gerencie pedidos rapidamente</p>
                 </div>
                 {cart.length > 0 && (
                   <a href="#pos-cart" className="shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20 xl:hidden">
                     Ver venda ({cart.length})
                   </a>
                 )}
               </div>

               {/* Search & Modalities Row */}
               <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                 <div className="relative flex-1 group w-full">
                   <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={16} />
                   <input
                     ref={searchInputRef}
                     type="text"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     aria-label="Buscar produtos"
                     className="w-full rounded-xl border border-border/80 bg-background py-2.5 pl-10 pr-12 text-sm outline-none transition-all focus:border-primary focus-visible:ring-2 focus-visible:ring-primary"
                     placeholder="Buscar produtos (F2)..."
                   />
                   <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                     F2
                   </kbd>
                 </div>
                 <OrderTypeSelector currentType={fulfillmentType} onTypeChange={setFulfillmentType} />
               </div>

               {/* Categories Filter Bar */}
               <div className="flex items-center justify-between gap-2 overflow-x-auto pt-1 pb-0.5 no-scrollbar">
                 <div className="flex items-center gap-1.5">
                   {categories.map((cat) => (
                     <button
                       key={cat}
                       type="button"
                       onClick={() => setSelectedCategory(cat)}
                       className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-all whitespace-nowrap ${
                         selectedCategory === cat
                           ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                           : 'border border-border/60 bg-card/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                       }`}
                     >
                       {cat}
                     </button>
                   ))}
                 </div>
                 <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 pl-2">
                   <span className="font-semibold">Ordenar por:</span>
                   <select aria-label="Ordenar produtos" className="rounded-lg border border-border/60 bg-card px-2 py-1 text-xs font-bold text-foreground outline-none">
                     <option value="popular">Mais vendidos</option>
                     <option value="name">Nome (A-Z)</option>
                     <option value="price">Menor preço</option>
                   </select>
                 </div>
               </div>

               <div className="rounded-xl border border-border bg-muted/40 p-3 md:hidden">
                 <div className="flex items-start justify-between gap-3">
                   <div>
                     <p className="text-xs font-black text-foreground">Dados do atendimento</p>
                     <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                       {isDelivery
                         ? 'Informe cliente e endereço antes de calcular o frete.'
                         : 'Informe o cliente antes de fechar a conta.'}
                     </p>
                   </div>
                   <button
                     type="button"
                     onClick={() => setIsCustomerDrawerOpen(true)}
                     className="shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold text-primary outline-none transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring"
                   >
                     {selectedCustomer || customerName.trim() ? 'Conferir' : 'Informar'}
                   </button>
                 </div>
                 {isDelivery && !deliveryFeeCalculated && !deliveryMissingRequiredData && (
                   <p className="mt-2 border-t border-border pt-2 text-xs font-medium text-muted-foreground">Frete pendente: abra os dados do atendimento para calcular.</p>
                 )}
               </div>
             </div>

             {/* Grid of Product Cards */}
             <div className="min-h-[18rem] flex-1 overflow-y-auto p-3.5 sm:p-4 custom-scrollbar md:min-h-0">
               <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-3.5">
                 {filteredProducts.map((p) => <ProductCard key={p.id} product={p} onAdd={addToCart} />)}
               </div>
            </div>
           </>
        ) : (
           <PosSalonView tables={salonTables || []} isLoading={salonLoading} onSelectTable={handleSelectTable} onTransferTable={handleTransferTable} />
        )}
      </section>

      {/* ========== RIGHT: CART ========== */}
      <aside id="pos-cart" aria-labelledby="pos-cart-title" className={`order-2 flex min-h-[30rem] w-full flex-col border-t border-border/80 bg-card shadow-2xl transition-transform md:min-h-0 md:w-[380px] md:border-l md:border-t-0 lg:w-[420px] ${viewMode === 'salon' ? 'translate-x-full md:translate-x-0' : ''}`}>
        {/* Operator & Order # Bar */}
        <div className="shrink-0 px-4 py-3 bg-card/90 flex items-center justify-between border-b border-border">
           <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <h2 id="pos-cart-title" className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  OPERADOR: {activeSession?.operatorName || 'DONO DA PIZZARIA'}
                </h2>
              </div>
           </div>
           <div className="flex items-center gap-2">
             <span className="text-xs font-extrabold text-foreground">PDV #0042</span>
             {currentOrderId && (
               <>
                 <button
                   onClick={() => handlePrint(currentOrderId!, 'customer')}
                   aria-label="Imprimir cupom do cliente"
                   className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                   title="Imprimir Cupom"
                >
                  <Receipt size={14} />
                </button>
                 <button
                   onClick={() => handlePrint(currentOrderId!, 'kitchen')}
                   aria-label="Imprimir ticket da cozinha"
                   className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  title="Imprimir Cozinha"
                >
                  <Printer size={14} />
                </button>
               </>
             )}
           </div>
        </div>

        {/* Customer Block */}
        <div className="shrink-0 px-4 py-3 bg-muted/20 border-b border-border/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Cliente</span>
            {isDelivery && (
              <span className="text-[9px] font-bold text-destructive uppercase animate-pulse">
                Requer Identificação
              </span>
            )}
          </div>
          {(!selectedCustomer && !customerName.trim()) ? (
            <button
              onClick={() => setIsCustomerDrawerOpen(true)}
              className="w-full flex items-center justify-between rounded-xl border border-dashed border-border/80 bg-background px-3 py-2.5 text-xs font-bold text-foreground transition-all hover:border-primary/50 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex items-center gap-2">
                <UserPlus size={16} className="text-primary" />
                Identificar cliente
              </span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-3 shadow-sm">
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{selectedCustomer?.name || customerName}</p>
                <p className="text-[10px] text-muted-foreground">{selectedCustomer?.phone || customerPhone}</p>
              </div>
              <button
                onClick={() => setIsCustomerDrawerOpen(true)}
                className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/20"
              >
                Editar
              </button>
            </div>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5 bg-card/40">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Itens do pedido</span>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-destructive transition-colors"
              >
                <X size={12} /> Limpar
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="h-full min-h-48 flex flex-col items-center justify-center text-center text-muted-foreground p-4">
              <ShoppingCart size={40} strokeWidth={1} className="text-muted-foreground/50" />
              <p className="mt-3 text-sm font-bold text-foreground">Adicione itens para iniciar a venda.</p>
              <button onClick={() => { setViewMode('catalog'); searchInputRef.current?.focus(); }} className="mt-3 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/20">
                Ir para o catálogo
              </button>
            </div>
          ) : (
            cart.map((item) => {
              const itemImage = products?.find(p => p.id === item.productId || p.name === item.name)?.image;
              return (
                <div key={item.cartLineId} className="flex gap-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm hover:border-border transition-all">
                  <div className="w-12 h-12 rounded-xl bg-muted/30 shrink-0 overflow-hidden relative border border-border/40">
                    {itemImage ? (
                      <img src={itemImage} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/60">
                        <Package size={20} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex justify-between items-start gap-2">
                      <p className="font-bold text-foreground text-xs leading-snug truncate">{item.name}</p>
                      <span className="font-extrabold text-foreground text-xs tabular-nums shrink-0">{formatCurrency(item.basePrice * item.quantity)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium">
                      {item.quantity}x {formatCurrency(item.basePrice)}
                    </p>
                    {item.compositionLabel ? (
                      <p className="text-[10px] text-muted-foreground font-medium line-clamp-1 mt-0.5">{item.compositionLabel}</p>
                    ) : null}

                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/40">
                      <div className="flex items-center rounded-lg border border-border/80 bg-background p-0.5">
                        <button onClick={() => updateCartItem(item.cartLineId, { quantity: Math.max(1, item.quantity - 1) })} aria-label={`Diminuir ${item.name}`} className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground">
                          <Minus size={12} strokeWidth={2.5} />
                        </button>
                        <span className="w-6 text-center font-black text-xs text-foreground tabular-nums">{item.quantity}</span>
                        <button onClick={() => updateCartItem(item.cartLineId, { quantity: item.quantity + 1 })} aria-label={`Aumentar ${item.name}`} className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground">
                          <Plus size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                      <button onClick={() => removeFromCart(item.cartLineId)} aria-label={`Remover ${item.name}`} className="text-muted-foreground hover:text-destructive p-1 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Totals & CTA */}
        <div className="shrink-0 p-4 bg-card/90 space-y-3 border-t border-border">
          {fulfillmentType === PosFulfillmentType.TABLE && (
             <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><Hash size={14} /></span>
                  <input className="w-full bg-background border border-border rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-foreground outline-none focus:border-primary" placeholder="Selecione uma mesa no salão" value={tableNumber} readOnly aria-label="Mesa selecionada" />
                </div>
                <button
                  onClick={handleSaveDraft}
                  disabled={!selectedTableId || cart.length === 0 || upsertDraft.isPending}
                  className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed"
                >
                   <Save size={14} />
                   {upsertDraft.isPending ? 'Salvando...' : 'Lançar Comanda'}
                </button>
             </div>
          )}

          {currentOrderId && fulfillmentType === PosFulfillmentType.TABLE && (
            <button
              onClick={() => setIsSplitModalOpen(true)}
              className="w-full bg-background hover:bg-muted text-foreground border border-border rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
            >
                <Users size={14} />
                Dividir Conta / Fechamento Parcial
            </button>
          )}

          <div className="space-y-1.5 border-t border-border/60 pt-3">
             <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                <span>Subtotal ({cart.length} itens)</span>
                <span className="font-bold tabular-nums text-foreground">{formatCurrency(subtotal)}</span>
             </div>
             {isDelivery && (
               <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                 <span>Frete / Taxa de serviço</span>
                 <span className="font-bold tabular-nums text-foreground">{deliveryFeeCalculated ? formatCurrency(deliveryFee) : 'Pendente'}</span>
               </div>
             )}
             <div className="flex justify-between items-baseline pt-2 border-t border-border/60">
                <span className="text-base font-extrabold text-foreground">Total</span>
                <span className="text-3xl font-black text-primary tabular-nums">{formatCurrency(total)}</span>
             </div>
          </div>

          {saleError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-2.5 flex items-start gap-2">
              <CircleAlert size={15} className="text-destructive shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[11px] font-bold text-destructive leading-tight">{saleError}</p>
              <button type="button" onClick={() => setSaleError(null)} aria-label="Fechar mensagem de erro" className="ml-auto rounded p-0.5 text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring"><X size={14} /></button>
            </div>
          )}

          {!canFinalizeSale && !createSale.isPending && (
            <p id="pos-finish-requirement" className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-2.5 text-xs font-medium leading-snug text-muted-foreground">
              <CircleAlert size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              {finishBlocker}
            </p>
          )}

          <button
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={!canFinalizeSale}
            aria-describedby={!canFinalizeSale ? 'pos-finish-requirement' : undefined}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black py-3.5 rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 text-sm sm:text-base transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70"
          >
             {createSale.isPending ? 'Finalizando venda…' : 'FECHAR CONTA (F4)'}
             <ChevronRight size={18} strokeWidth={3} />
          </button>
        </div>
      </aside>

      <PaymentModal 
        isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)}
        total={total} subtotal={subtotal} discount={discountTotal} onConfirm={handleConfirmSale} isPending={createSale.isPending}
      />

      <PosCustomerDrawer
        isOpen={isCustomerDrawerOpen}
        onClose={() => setIsCustomerDrawerOpen(false)}
        fulfillmentType={fulfillmentType}
        selectedCustomer={selectedCustomer}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        customerSearchTerm={customerSearchTerm}
        setCustomerSearchTerm={setCustomerSearchTerm}
        foundCustomers={foundCustomers}
        onSelectCustomer={selectCustomer}
        onClearCustomer={clearSelectedCustomer}
        addressesForSelectedCustomer={addressesForSelectedCustomer}
        selectedAddressId={selectedAddressId}
        setSelectedAddressId={setSelectedAddressId}
        editingAddressId={editingAddressId}
        setEditingAddressId={setEditingAddressId}
        deliveryAddress={deliveryAddress}
        setDeliveryAddress={setDeliveryAddress}
        onUpdateDeliveryAddress={updateDeliveryAddress}
        onApplyAddress={applyAddress}
        deliveryFee={deliveryFee}
        deliveryFeeCalculated={deliveryFeeCalculated}
        deliveryFeeError={deliveryFeeError}
        deliveryFeeRule={deliveryFeeRule}
        onCalculateDeliveryFee={handleCalculateDeliveryFee}
        onResetDeliveryFee={resetDeliveryFee}
        isSavingCustomerAddress={isSavingCustomerAddress}
        onSaveCustomerAndAddress={handleSaveCustomerAndAddress}
        deliveryMissingRequiredData={deliveryMissingRequiredData}
      />

      {sourceTableForTransfer && (
        <TransferTableModal 
          isOpen={isTransferModalOpen}
          onClose={() => {
            setIsTransferModalOpen(false);
            setSourceTableForTransfer(null);
          }}
          sourceTableId={sourceTableForTransfer.id}
          sourceTableName={sourceTableForTransfer.name}
          availableTables={salonTables?.filter(t => t.id !== sourceTableForTransfer.id).map(t => ({ id: t.id, name: t.name, status: t.status })) || []}
        />
      )}

      {configProductId && (
        <PosItemConfiguratorModal
          isOpen={!!configProductId}
          productId={configProductId}
          onClose={() => setConfigProductId(null)}
          onConfirm={(res) => {
            setCart((prev) => [
              ...prev,
              {
                cartLineId: generateId(),
                lineType: res.lineType,
                ...(res.lineType === 'combo'
                  ? { comboId: res.productId, productId: res.productId, slots: res.slots }
                  : {
                      productId: res.productId,

                      selections: res.selections,
                      pizzaComposition: res.pizzaComposition,
                    }),
                name: res.name,
                basePrice: res.computedUnitPrice,
                quantity: res.quantity,
                notes: res.notes || '',
                compositionLabel: res.compositionLabel,
              },
            ]);
            setConfigProductId(null);
          }}
        />
      )}

      {!activeSession && (
        <div className="fixed inset-0 z-[90] bg-background/85 dark:bg-muted950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <Receipt size={22} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-foreground uppercase leading-tight">Abra o caixa para iniciar vendas no PDV</h2>
                <p className="mt-2 text-sm text-muted-foreground">Vendas reais ficam bloqueadas ate uma sessao de caixa ser aberta para este operador.</p>
                <button
                  onClick={() => { window.location.href = '/cash'; }}
                  className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-black px-4 py-3 rounded-xl text-xs uppercase tracking-widest"
                >
                  Abrir caixa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentOrderId && (
        <SplitPaymentModal
          isOpen={isSplitModalOpen}
          orderId={currentOrderId}
          orderTotal={total}
          items={cart.map(it => ({
            id: it.cartLineId, // Usamos cartLineId pq no PDV atual nao temos o ID real do orderItem no frontend
                               // FIXME: Numa versao real, usariamos o ID do banco
            snapshotName: it.name,
            quantity: it.quantity,
            unitPrice: it.basePrice,
            lineTotal: it.basePrice * it.quantity
          }))}
          onClose={() => setIsSplitModalOpen(false)}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['posSalon'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            // Optionally reload order details here if needed
          }}
        />
      )}
    </main>
  );
}
