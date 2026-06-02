import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
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
  Phone,
  UserPlus,
  MapPin,
  Home,
  RefreshCw,
  Edit3,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

// New Components
import { OrderTypeSelector } from './components/OrderTypeSelector';
import { ProductCard } from './components/ProductCard';
import { PaymentModal } from './components/PaymentModal';
import { PosSalonView, type SalonTable } from './components/PosSalonView';
import { TransferTableModal } from './components/TransferTableModal';
import { PosItemConfiguratorModal } from './components/PosItemConfiguratorModal';
import { SplitPaymentModal } from './components/SplitPaymentModal';
import type { CreateOrderItemSelectionGroupDTO, CreateOrderItemComboSlotSelectionDTO, PizzaCompositionDTO } from '@gestor/types';

interface CatalogProduct {
  id: string;
  name: string;
  basePrice: number;
  image: string | null;
  categoryName: string;
  categoryId: string;
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
  complements?: Array<{ groupId: string; itemId: string }>;
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
  const [selectedCategoryId] = useState<string | null>(null);
  
  // Mesa Fields
  const [tableNumber, setTableNumber] = useState('');
  
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
  const [sourceTableForTransfer, setSourceTableForTransfer] = useState<SalonTable | null>(null);

  const [configProductId, setConfigProductId] = useState<string | null>(null);

  const handleTransferTable = useCallback((table: SalonTable) => {
    setSourceTableForTransfer(table);
    setIsTransferModalOpen(true);
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchInputRef.current?.focus(); }
      if (e.key === 'F4' && cart.length > 0 && !isPaymentModalOpen) { e.preventDefault(); setIsPaymentModalOpen(true); }
      if (e.key === 'Escape') {
        if (isPaymentModalOpen) setIsPaymentModalOpen(false);
        if (showCustomerSearch) setShowCustomerSearch(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length, isPaymentModalOpen, showCustomerSearch]);

  // Printing Utility
  const handlePrint = async (orderId: string, type: 'customer' | 'kitchen') => {
    try {
      const res = await api.get<{ content: string }>(`/pos/sales/${orderId}/print?type=${type}`);
      if (res.success && res.data.content) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head>
                <style>
                  @media print { margin: 0; }
                  pre { font-family: 'Courier New', Courier, monospace; font-size: 12px; white-space: pre-wrap; }
                </style>
              </head>
              <body><pre>${res.data.content}</pre></body>
            </html>
          `);
          printWindow.document.close();
          printWindow.focus();
          // Small delay for document rendering
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 250);
        }
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
        type: (p['type'] as 'simple' | 'configurable' | 'combo') || 'simple',
      }));
    },
    refetchOnWindowFocus: false,
  });

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
    },
    onError: (error) => {
      setDeliveryFee(0);
      setDeliveryFeeCalculated(false);
      setDeliveryFeeRule(null);
      setDeliveryFeeError(error instanceof Error ? error.message : 'Nao foi possivel calcular o frete.');
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

  useMemo(() => {
    if (!products) return [];
    const catsMap = new Map<string, { id: string; name: string }>();
    products.forEach(p => { if (!catsMap.has(p.categoryId)) catsMap.set(p.categoryId, { id: p.categoryId, name: p.categoryName }); });
    return Array.from(catsMap.values());
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!selectedCategoryId) return products;
    return products.filter(p => p.categoryId === selectedCategoryId);
  }, [products, selectedCategoryId]);

  const addToCart = useCallback((product: CatalogProduct) => {
    // Produtos configuráveis/combos devem passar pelo fluxo de configuração.
    if (product.type === 'configurable' || product.type === 'combo') {
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
  const deliveryMissingRequiredData =
    isDelivery &&
    (!customerName.trim() ||
      !customerPhone.trim() ||
      !deliveryAddress.street.trim() ||
      !deliveryAddress.number.trim() ||
      !deliveryAddress.neighborhood.trim());
  const canFinalizeSale =
    !!activeSession &&
    cart.length > 0 &&
    !createSale.isPending &&
    (!isDelivery || (!deliveryMissingRequiredData && deliveryFeeCalculated));
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
            complements: item.complements,
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
    upsertDraft.mutate(getPayload(), {
        onSuccess: (data) => {
            setCurrentOrderId(data.id);
            handlePrint(data.id, 'kitchen'); // Print production ticket
            setViewMode('salon');
        }
    });
  };

  const handleConfirmSale = (method: PaymentMethod) => {
    if (!activeSession) return;
    if (isDelivery && deliveryMissingRequiredData) {
      setDeliveryFeeError('Delivery exige cliente, telefone, rua, numero e bairro.');
      return;
    }
    if (isDelivery && !deliveryFeeCalculated) {
      setDeliveryFeeError('Calcule o frete antes de finalizar a venda delivery.');
      return;
    }
    createSale.mutate({ ...getPayload(), paymentMethod: method }, {
      onSuccess: (data) => {
        handlePrint(data.id, 'customer'); // Auto-print customer receipt
        setCart([]); setCurrentOrderId(null); setTableNumber(''); setViewMode('salon'); setIsPaymentModalOpen(false);
        clearSelectedCustomer();
        setDeliveryFee(0); setDeliveryFeeCalculated(false); setDeliveryFeeError(null);
        queryClient.invalidateQueries({ queryKey: ['posSalon'] });
      },
    });
  };

  if (sessionLoading) return <div className="flex flex-col items-center justify-center h-screen bg-background dark:bg-muted950 text-muted-foreground500 dark:text-muted-foreground400 italic uppercase font-black animate-pulse">Carregando Sessão...</div>;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] bg-background dark:bg-muted950 text-foreground overflow-hidden font-sans">
      
      {/* ========== LEFT: NAVIGATION ========== */}
      <div className="hidden lg:flex w-16 flex-col bg-card dark:bg-muted900 border-r border-border200 dark:border-border800 py-4 gap-4 items-center">
        <button 
          onClick={() => setViewMode('catalog')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${viewMode === 'catalog' ? 'bg-status-success text-foreground shadow-lg' : 'bg-card dark:bg-muted800 text-muted-foreground500 dark:text-muted-foreground400 hover:bg-muted100 dark:bg-muted700'}`}
          title="Catálogo"
        >
          <Store size={20} />
        </button>
        <button 
          onClick={() => { setViewMode('salon'); queryClient.invalidateQueries({ queryKey: ['posSalon'] }); }}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${viewMode === 'salon' ? 'bg-status-success text-foreground shadow-lg' : 'bg-card dark:bg-muted800 text-muted-foreground500 dark:text-muted-foreground400 hover:bg-muted100 dark:bg-muted700'}`}
          title="Salão"
        >
          <LayoutGrid size={20} />
        </button>
        <div className="w-6 h-[1px] bg-card dark:bg-muted800" />
        <button className="w-10 h-10 bg-card dark:bg-muted800 text-muted-foreground500 dark:text-muted-foreground400 rounded-xl flex items-center justify-center hover:text-muted-foreground900 dark:text-white transition-colors" title="Configurações">
           <Keyboard size={18} />
        </button>
      </div>

      {/* ========== CENTER: CONTENT ========== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background dark:bg-muted950">
        {viewMode === 'catalog' ? (
           <>
            <div className="p-3 bg-card dark:bg-muted900 border-b border-border200 dark:border-border800 flex flex-col xl:flex-row gap-3 items-center">
              <div className="relative flex-1 group w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground600 dark:text-muted-foreground400 group-focus-within:text-status-success" size={16} />
                <input
                  ref={searchInputRef}
                  type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-card dark:bg-muted800 border border-border200 dark:border-border700 rounded-xl pl-12 pr-4 py-2.5 text-sm outline-none focus:border-status-success transition-all"
                  placeholder="F2 para buscar..."
                />
              </div>
              <OrderTypeSelector currentType={fulfillmentType} onTypeChange={setFulfillmentType} />
            </div>
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
               <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                 {filteredProducts.map((p) => <ProductCard key={p.id} product={p} onAdd={addToCart} />)}
               </div>
            </div>
           </>
        ) : (
           <PosSalonView tables={salonTables || []} isLoading={salonLoading} onSelectTable={handleSelectTable} onTransferTable={handleTransferTable} />
        )}
      </div>

      {/* ========== RIGHT: CART ========== */}
      <div className={`w-full md:w-[380px] lg:w-[420px] flex flex-col bg-card dark:bg-muted900 border-l border-border200 dark:border-border800 shadow-2xl z-10 transition-transform ${viewMode === 'salon' ? 'translate-x-full md:translate-x-0' : ''}`}>
        <div className="px-4 py-3 bg-card flex items-center justify-between border-b border-border200 dark:border-border800">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
             <span className="text-[10px] font-black uppercase text-status-success">OPERADOR: {activeSession?.operatorName || 'N/A'}</span>
           </div>
           <div className="flex gap-2">
             {currentOrderId && (
               <>
                <button 
                  onClick={() => handlePrint(currentOrderId!, 'customer')}
                  className="bg-card dark:bg-muted800 text-muted-foreground600 dark:text-muted-foreground400 p-1.5 rounded-lg hover:text-muted-foreground900 dark:text-white transition-colors"
                  title="Imprimir Cupom"
                >
                  <Receipt size={14} />
                </button>
                <button 
                  onClick={() => handlePrint(currentOrderId!, 'kitchen')}
                  className="bg-card dark:bg-muted800 text-muted-foreground600 dark:text-muted-foreground400 p-1.5 rounded-lg hover:text-muted-foreground900 dark:text-white transition-colors"
                  title="Imprimir Cozinha"
                >
                  <Printer size={14} />
                </button>
               </>
             )}
             {currentOrderId && (
               <span className="bg-status-warning/10 text-status-warning text-[9px] font-black uppercase px-2 py-0.5 rounded border border-status-warning/20 shadow-sm">Comanda Aberta</span>
             )}
           </div>
        </div>

          <div className="px-4 py-3 bg-card border-b border-border200 dark:border-border800 space-y-3">
           <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-muted-foreground500 dark:text-muted-foreground400 tracking-widest flex items-center gap-1.5 leading-none">
                <Phone size={12} className="text-status-success" />
                Cliente do pedido
              </span>
              {selectedCustomer ? (
                <button onClick={clearSelectedCustomer} className="text-[10px] font-black uppercase text-muted-foreground500 hover:text-destructive transition-colors">
                  Trocar
                </button>
              ) : (
                <button onClick={() => setShowCustomerSearch(!showCustomerSearch)} className="text-muted-foreground500 dark:text-muted-foreground400 hover:text-status-success transition-colors">
                  <Search size={16} />
                </button>
              )}
           </div>

           {!selectedCustomer && (
              <div className="relative animate-in fade-in slide-in-from-top-2">
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground500" size={14} />
                   <input
                     autoFocus={showCustomerSearch}
                     className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
                     placeholder="Buscar por telefone ou nome"
                     value={customerSearchTerm}
                     onChange={(e) => {
                       setCustomerSearchTerm(e.target.value);
                       if (!customerPhone && /\d/.test(e.target.value)) setCustomerPhone(e.target.value);
                     }}
                   />
                 </div>
                 {foundCustomers && foundCustomers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-card dark:bg-muted800 border border-border200 dark:border-border700 rounded-xl mt-1 shadow-2xl z-50 overflow-hidden">
                       {foundCustomers.map((customer) => (
                         <button
                           key={customer.id}
                           onClick={() => selectCustomer(customer)}
                           className="w-full text-left px-4 py-3 hover:bg-muted100 dark:hover:bg-muted750 transition-colors border-b border-border200 dark:border-border700 last:border-0"
                         >
                           <div className="flex items-center justify-between gap-3">
                             <div className="min-w-0">
                               <p className="font-black text-xs text-muted-foreground900 dark:text-white truncate">{customer.name}</p>
                               <p className="text-[10px] font-bold text-muted-foreground500">{customer.phone}</p>
                             </div>
                             <span className="text-[9px] font-black uppercase text-status-success">{customer.orderCount} pedidos</span>
                           </div>
                         </button>
                       ))}
                    </div>
                 )}
              </div>
           )}

           <div className="grid grid-cols-[1fr_130px] gap-2">
             <input
               className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
               placeholder={isDelivery ? 'Nome do cliente' : 'Cliente opcional'}
               value={customerName}
               disabled={!!selectedCustomer}
               onChange={(e) => setCustomerName(e.target.value)}
             />
             <input
               className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
               placeholder={isDelivery ? 'Telefone' : 'Telefone opcional'}
               value={customerPhone}
               disabled={!!selectedCustomer}
               onChange={(e) => setCustomerPhone(e.target.value)}
             />
           </div>

           {selectedCustomer && (
             <div className="flex items-center justify-between rounded-xl bg-status-success/10 border border-status-success/20 px-3 py-2">
               <div className="min-w-0">
                 <p className="text-xs font-black text-foreground truncate">{selectedCustomer.name}</p>
                 <p className="text-[10px] font-bold text-muted-foreground">{selectedCustomer.phone}</p>
               </div>
               <CheckCircle size={18} className="text-status-success shrink-0" />
             </div>
           )}

           {isDelivery && (
             <div className="space-y-3 border-t border-border200 dark:border-border800 pt-3">
               {selectedCustomer && addressesForSelectedCustomer.length > 0 && (
                 <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <span className="text-[10px] font-black uppercase text-muted-foreground500 tracking-widest flex items-center gap-1">
                       <Home size={12} />
                       Enderecos salvos
                     </span>
                     <button
                       onClick={() => {
                         setEditingAddressId(null);
                         setSelectedAddressId(null);
                         setDeliveryAddress(emptyDeliveryAddress);
                         resetDeliveryFee();
                       }}
                       className="text-[10px] font-black uppercase text-primary"
                     >
                       Novo
                     </button>
                   </div>
                   <div className="max-h-28 overflow-y-auto space-y-2 pr-1">
                     {addressesForSelectedCustomer.map((address) => (
                       <button
                         key={address.id}
                         onClick={() => applyAddress(address)}
                         className={`w-full text-left rounded-xl border px-3 py-2 transition-all ${selectedAddressId === address.id ? 'border-primary bg-primary/10' : 'border-border200 dark:border-border800 bg-muted50 dark:bg-muted950 hover:border-primary/40'}`}
                       >
                         <div className="flex items-start justify-between gap-2">
                           <div className="min-w-0">
                             <p className="text-xs font-black text-foreground truncate">{address.label || `${address.street}, ${address.number}`}</p>
                             <p className="text-[10px] font-bold text-muted-foreground truncate">{address.neighborhood} · {address.city}/{address.state}</p>
                           </div>
                           {address.isDefault && <span className="text-[9px] font-black uppercase text-status-success">Padrao</span>}
                         </div>
                       </button>
                     ))}
                   </div>
                 </div>
               )}

               <div className="grid grid-cols-[1fr_88px] gap-2">
                 <input
                   className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
                   placeholder="Rua"
                   value={deliveryAddress.street}
                   onChange={(e) => updateDeliveryAddress('street', e.target.value)}
                 />
                 <input
                   className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
                   placeholder="Numero"
                   value={deliveryAddress.number}
                   onChange={(e) => updateDeliveryAddress('number', e.target.value)}
                 />
               </div>
               <div className="grid grid-cols-2 gap-2">
                 <input
                   className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
                   placeholder="Bairro"
                   value={deliveryAddress.neighborhood}
                   onChange={(e) => updateDeliveryAddress('neighborhood', e.target.value)}
                 />
                 <input
                   className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
                   placeholder="Cidade"
                   value={deliveryAddress.city}
                   onChange={(e) => updateDeliveryAddress('city', e.target.value)}
                 />
               </div>
               <div className="grid grid-cols-[72px_1fr] gap-2">
                 <input
                   className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white uppercase outline-none focus:border-status-success"
                   placeholder="UF"
                   maxLength={2}
                   value={deliveryAddress.state}
                   onChange={(e) => updateDeliveryAddress('state', e.target.value.toUpperCase())}
                 />
                 <input
                   className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
                   placeholder="CEP"
                   value={deliveryAddress.zipCode}
                   onChange={(e) => updateDeliveryAddress('zipCode', e.target.value)}
                 />
               </div>
               <div className="grid grid-cols-2 gap-2">
                 <input
                   className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
                   placeholder="Complemento"
                   value={deliveryAddress.complement}
                   onChange={(e) => updateDeliveryAddress('complement', e.target.value)}
                 />
                 <input
                   className="w-full bg-muted50 dark:bg-muted950 border border-border200 dark:border-border800 rounded-xl px-3 py-2 text-xs text-muted-foreground900 dark:text-white outline-none focus:border-status-success"
                   placeholder="Referencia"
                   value={deliveryAddress.reference}
                   onChange={(e) => updateDeliveryAddress('reference', e.target.value)}
                 />
               </div>

               <div className="grid grid-cols-2 gap-2">
                 <button
                   onClick={handleSaveCustomerAndAddress}
                   disabled={isSavingCustomerAddress || !customerName.trim() || !customerPhone.trim() || deliveryMissingRequiredData}
                   className="bg-card dark:bg-muted800 hover:bg-muted100 dark:hover:bg-muted750 text-muted-foreground700 dark:text-muted-foreground300 border border-border200 dark:border-border700 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70"
                 >
                   {editingAddressId ? <Edit3 size={13} /> : <UserPlus size={13} />}
                   {editingAddressId ? 'Salvar edicao' : selectedCustomer ? 'Salvar endereco' : 'Salvar cliente'}
                 </button>
                 {selectedAddressId && (
                   <button
                     onClick={() => setEditingAddressId(selectedAddressId)}
                     className="bg-card dark:bg-muted800 hover:bg-muted100 dark:hover:bg-muted750 text-muted-foreground700 dark:text-muted-foreground300 border border-border200 dark:border-border700 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                   >
                     <Edit3 size={13} />
                     Editar
                   </button>
                 )}
               </div>

               <button
                 onClick={handleCalculateDeliveryFee}
                 disabled={deliveryRateMutation.isPending}
                 className="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl py-2.5 text-[10px] font-black uppercase tracking-widest transition-all disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 flex items-center justify-center gap-2"
               >
                 <RefreshCw size={13} className={deliveryRateMutation.isPending ? 'animate-spin' : ''} />
                 {deliveryRateMutation.isPending ? 'Calculando frete...' : `Frete: ${deliveryFeeCalculated ? formatCurrency(deliveryFee) : 'Calcular'}`}
               </button>
               {deliveryFeeCalculated && (
                 <div className="rounded-xl bg-primary/5 border border-primary/15 px-3 py-2 text-[10px] font-bold text-muted-foreground flex items-start gap-2">
                   <MapPin size={13} className="text-primary mt-0.5 shrink-0" />
                   <span>{deliveryAddress.neighborhood || 'Bairro'} · {deliveryFeeRule || deliveryAddress.street || 'Endereco'} · {formatCurrency(deliveryFee)}</span>
                 </div>
               )}
               {deliveryFeeError && (
                 <p className="text-[10px] font-bold text-destructive flex items-center gap-1">
                   <AlertCircle size={12} />
                   {deliveryFeeError}
                 </p>
               )}
             </div>
           )}
        </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-card/50 dark:bg-muted900/50 scrollbar-hide">
             {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <ShoppingCart size={48} strokeWidth={1} />
                <p className="font-black mt-2 text-[10px] uppercase">Aguardando Itens</p>
              </div>
             ) : (
               cart.map((item) => (
               <div key={item.cartLineId} className="bg-card border border-border rounded-2xl p-4 group transition-all hover:bg-muted">
                 <div className="flex justify-between items-start gap-4 mb-3">
                   <p className="font-bold text-foreground text-[13px] leading-tight">{item.name}</p>
                   <button onClick={() => removeFromCart(item.cartLineId)} className="text-muted-foreground hover:text-destructive transition-colors"><X size={16} /></button>
                 </div>
                   {item.compositionLabel ? (
                     <div className="text-[10px] text-muted-foreground500 dark:text-muted-foreground400 font-bold mb-2 line-clamp-2">
                       {item.compositionLabel}
                     </div>
                   ) : null}
                   <div className="flex items-center justify-between">
                     <div className="flex items-center bg-card rounded-xl p-1 border border-border">
                       <button onClick={() => updateCartItem(item.cartLineId, { quantity: Math.max(1, item.quantity - 1) })} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"><Minus size={14} strokeWidth={3} /></button>
                       <span className="w-8 text-center font-black text-sm text-foreground">{item.quantity}</span>
                       <button onClick={() => updateCartItem(item.cartLineId, { quantity: item.quantity + 1 })} className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"><Plus size={14} strokeWidth={3} /></button>
                     </div>
                     <p className="text-status-success font-extrabold text-lg">{formatCurrency(item.basePrice * item.quantity)}</p>
                   </div>
                </div>
              ))
            )}
        </div>

        <div className="p-4 bg-muted50 dark:bg-muted950 space-y-4 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
            {fulfillmentType === PosFulfillmentType.TABLE && (
               <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground600 dark:text-muted-foreground400"><Hash size={14} /></span>
                  <input className="w-full bg-card dark:bg-muted900 border border-border200 dark:border-border800 rounded-xl pl-9 pr-4 py-3 text-xs font-bold text-muted-foreground900 dark:text-white outline-none focus:border-status-success" placeholder="Nº Mesa" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} />
                  </div>
                  <button 
                    onClick={handleSaveDraft}
                    disabled={!tableNumber || cart.length === 0 || upsertDraft.isPending}
                  className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                     <Save size={14} />
                     {upsertDraft.isPending ? 'Salvando...' : 'Lançar Comanda'}
                  </button>
               </div>
            )}

            {currentOrderId && fulfillmentType === PosFulfillmentType.TABLE && (
              <button 
                onClick={() => setIsSplitModalOpen(true)}
                className="w-full bg-card dark:bg-muted800 hover:bg-muted100 dark:bg-muted750 text-muted-foreground700 dark:text-muted-foreground300 border border-border200 dark:border-border700 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all mt-2"
              >
                  <Users size={14} />
                  Dividir Conta / Fechamento Parcial
              </button>
            )}

            <div className="space-y-1.5 border-t border-border200 dark:border-border800/50 pt-3">
               <div className="flex justify-between text-[11px] font-bold text-muted-foreground500 dark:text-muted-foreground400 uppercase tracking-tighter">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
               </div>
               {isDelivery && (
                 <div className="space-y-1">
                   <div className="flex justify-between text-[11px] font-bold text-muted-foreground500 dark:text-muted-foreground400 uppercase tracking-tighter">
                     <span>Frete</span>
                     <span>{deliveryFeeCalculated ? formatCurrency(deliveryFee) : 'Pendente'}</span>
                   </div>
                   {deliveryFeeRule && (
                     <p className="text-[10px] font-bold text-muted-foreground500 dark:text-muted-foreground400 truncate">{deliveryFeeRule}</p>
                   )}
                 </div>
               )}
               <div className="flex justify-between items-end">
                  <span className="text-sm font-black text-muted-foreground900 dark:text-white uppercase italic">Total Líquido</span>
                  <span className="text-4xl font-black text-foreground tracking-tighter italic leading-none">{formatCurrency(total)}</span>
               </div>
            </div>

            <button 
              onClick={() => setIsPaymentModalOpen(true)}
              disabled={!canFinalizeSale}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black py-4 rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 text-base transition-all active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70"
            >
               {createSale.isPending ? 'PROCESSANDO...' : 'FECHAR CONTA (F4)'}
               <ChevronRight size={20} strokeWidth={3} />
            </button>
        </div>
      </div>

      <PaymentModal 
        isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)}
        total={total} subtotal={subtotal} discount={discountTotal} onConfirm={handleConfirmSale} isPending={createSale.isPending}
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
                      complements: res.complements,
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
    </div>
  );
}
