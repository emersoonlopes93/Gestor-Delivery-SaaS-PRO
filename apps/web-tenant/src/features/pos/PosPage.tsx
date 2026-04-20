import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useActiveSession } from '../cash/hooks/useCashSession';
import { useCreatePosSale, type PosCreateSalePayload } from './hooks/usePosSale';
import { PosFulfillmentType, PaymentMethod } from '@gestor/types';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  Wallet,
  User,
  Phone,
  FileText,
  Tag,
  Store,
  ChevronRight,
  Hash,
  X,
  Keyboard,
  MapPin,
  Truck
} from 'lucide-react';

// New Components
import { OrderTypeSelector } from './components/OrderTypeSelector';
import { ProductCard } from './components/ProductCard';
import { PaymentModal } from './components/PaymentModal';

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
}

interface CustomerResult {
  id: string;
  name: string;
  phone: string;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export default function PosPage() {
  const { data: activeSession, isLoading: sessionLoading } = useActiveSession();
  const createSale = useCreatePosSale();

  // Refs for shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Core State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<PosFulfillmentType>(PosFulfillmentType.DINE_IN);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  
  // Mesa Fields
  const [tableNumber, setTableNumber] = useState('');
  
  // Delivery Fields
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [feeStatus, setFeeStatus] = useState<'idle' | 'calculating' | 'done' | 'error'>('idle');
  const [deliveryAddress, setDeliveryAddress] = useState({
    street: '',
    number: '',
    neighborhood: '',
    complement: '',
    reference: '',
    zipCode: '',
  });

  // Customer Identification
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);

  // Financials
  const [discountTotal, setDiscountTotal] = useState(0);
  const [saleNotes, setSaleNotes] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [useCashbackAmount, setUseCashbackAmount] = useState(0);

  // UI Flow
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [saleCompleted, setSaleCompleted] = useState(false);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus Search (F2)
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Open Payment (F4)
      if (e.key === 'F4' && cart.length > 0 && !isPaymentModalOpen) {
        e.preventDefault();
        setIsPaymentModalOpen(true);
      }
      // Close Modals (ESC)
      if (e.key === 'Escape') {
        if (isPaymentModalOpen) setIsPaymentModalOpen(false);
        if (showCustomerSearch) setShowCustomerSearch(false);
      }
      // Clear Cart (Alt + Backspace or Delete)
      if (e.altKey && (e.key === 'Backspace' || e.key === 'Delete')) {
        if (cart.length > 0 && window.confirm('Deseja limpar o carrinho?')) {
          setCart([]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length, isPaymentModalOpen, showCustomerSearch]);

  // Delivery Fee Calculation Logic
  const calculateFee = async () => {
    if (!deliveryAddress.neighborhood || !deliveryAddress.street) return;
    
    setFeeStatus('calculating');
    try {
      // Reuses the public calculation endpoint
      const res = await api.post<any>('/delivery/rates/calculate', {
        tenantId: activeSession?.tenantId,
        address: {
          street: deliveryAddress.street,
          number: deliveryAddress.number,
          neighborhood: deliveryAddress.neighborhood,
          city: 'Local', // Standard placeholder
        }
      });
      
      if (res.success && res.data) {
        setDeliveryFee(Number(res.data.fee));
        setFeeStatus('done');
      } else {
        setFeeStatus('error');
      }
    } catch (err) {
      console.error('Error calculating delivery fee:', err);
      setFeeStatus('error');
    }
  };

  // Fetch products
  const { data: products, isLoading: productsLoading } = useQuery<CatalogProduct[]>({
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

  // Mock Customer Search
  const { data: foundCustomers } = useQuery<CustomerResult[]>({
    queryKey: ['posCustomers', customerSearchTerm],
    queryFn: async () => {
      if (customerSearchTerm.length < 2) return [];
      const allCustomers: CustomerResult[] = [
        { id: '1', name: 'Emerson Lopes', phone: '11999999999' },
        { id: '2', name: 'Alana Vieira', phone: '11888888888' },
        { id: '3', name: 'João Silva', phone: '11777777777' },
      ];
      return allCustomers.filter(c => 
        c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) || 
        c.phone.includes(customerSearchTerm)
      );
    },
    enabled: customerSearchTerm.length >= 2,
  });

  // Derive categories from products
  const categories = useMemo(() => {
    if (!products) return [];
    const catsMap = new Map<string, { id: string; name: string }>();
    products.forEach(p => {
      if (!catsMap.has(p.categoryId)) {
        catsMap.set(p.categoryId, { id: p.categoryId, name: p.categoryName });
      }
    });
    return Array.from(catsMap.values());
  }, [products]);

  // Filtered products by category
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!selectedCategoryId) return products;
    return products.filter(p => p.categoryId === selectedCategoryId);
  }, [products, selectedCategoryId]);

  const addToCart = useCallback((product: CatalogProduct) => {
    const isCombo = product.type === 'combo';
    setCart((prev) => [
      ...prev,
      {
        cartLineId: generateId(),
        lineType: isCombo ? 'combo' : 'product',
        ...(isCombo ? { comboId: product.id } : { productId: product.id }),
        name: product.name,
        basePrice: product.basePrice,
        quantity: 1,
        notes: '',
      },
    ]);
  }, []);

  const updateCartItem = useCallback((lineId: string, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((item) => item.cartLineId === lineId ? { ...item, ...updates } : item));
  }, []);

  const removeFromCart = useCallback((lineId: string) => {
    setCart((prev) => prev.filter((item) => item.cartLineId !== lineId));
  }, []);

  const clearCart = () => {
    if (cart.length > 0 && window.confirm('Deseja limpar o carrinho?')) {
      setCart([]);
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);
  const total = Math.max(0, subtotal - discountTotal + deliveryFee);

  const handleSelectCustomer = (c: CustomerResult) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerSearchTerm('');
    setShowCustomerSearch(false);
  };

  const handleConfirmSale = (method: PaymentMethod, _details?: any) => {
    if (cart.length === 0 || !activeSession) return;

    if (fulfillmentType === PosFulfillmentType.DELIVERY && (!deliveryAddress.street || !deliveryAddress.number || !deliveryAddress.neighborhood)) {
       alert('Preencha o endereço completo para Delivery');
       return;
    }

    const payload: PosCreateSalePayload = {
      idempotencyKey: generateId(),
      items: cart.map((item) => ({
        lineType: item.lineType,
        ...(item.lineType === 'product' ? { productId: item.productId } : { comboId: item.comboId }),
        quantity: item.quantity,
        notes: item.notes || undefined,
      })),
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      fulfillmentType,
      tableNumber: fulfillmentType === PosFulfillmentType.TABLE ? tableNumber : undefined,
      deliveryFee: fulfillmentType === PosFulfillmentType.DELIVERY ? deliveryFee : undefined,
      deliveryAddress: fulfillmentType === PosFulfillmentType.DELIVERY ? deliveryAddress : undefined,
      paymentMethod: method,
      discountTotal: discountTotal > 0 ? discountTotal : undefined,
      couponCode: couponCode || undefined,
      useCashbackAmount: useCashbackAmount > 0 ? useCashbackAmount : undefined,
      notes: saleNotes || undefined,
    };

    createSale.mutate(payload, {
      onSuccess: () => {
        setCart([]);
        setDiscountTotal(0);
        setCustomerName('');
        setCustomerPhone('');
        setCouponCode('');
        setUseCashbackAmount(0);
        setSaleNotes('');
        setTableNumber('');
        setDeliveryFee(0);
        setFeeStatus('idle');
        setDeliveryAddress({ street: '', number: '', neighborhood: '', complement: '', reference: '', zipCode: '' });
        setSaleCompleted(true);
        setIsPaymentModalOpen(false);
      },
    });
  };

  if (sessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-500">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="font-bold tracking-widest text-xs uppercase">Carregando PDV...</span>
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="flex items-center justify-center h-full min-h-[80vh] bg-gray-950 p-4">
        <div className="bg-gray-900 rounded-[2rem] p-8 border border-amber-900/30 text-center max-w-sm shadow-2xl">
          <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 border-2 border-amber-500/20">
            <Wallet size={32} />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Caixa Fechado</h2>
          <p className="text-gray-500 text-sm mb-8 px-4">
            É necessário abrir um turno de caixa antes de iniciar as operações de venda.
          </p>
          <a href="/cash" className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-emerald-900/20">
            Ir para Gestão de Caixa
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] bg-gray-950 text-gray-100 overflow-hidden font-sans">
      
      {/* ========== LEFT: SIDEBAR CATEGORIES ========== */}
      <div className="hidden lg:flex w-16 flex-col bg-gray-900 border-r border-gray-800 py-4 gap-3 items-center">
        <button 
          onClick={() => setSelectedCategoryId(null)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${!selectedCategoryId ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
          title="Todos os Produtos"
        >
          <Store size={18} />
        </button>
        <div className="w-6 h-[1px] bg-gray-800 rounded-full" />
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategoryId(cat.id)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${selectedCategoryId === cat.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
            title={cat.name}
          >
            <span className="text-[9px] font-black uppercase overflow-hidden text-center leading-tight">
              {cat.name.substring(0, 3)}
            </span>
          </button>
        ))}
      </div>

      {/* ========== CENTER: CATALOG ========== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-950">
        {/* Header / Search */}
        <div className="p-3 bg-gray-900 border-b border-gray-800 flex flex-col xl:flex-row gap-3 items-center">
          <div className="relative flex-1 group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-emerald-500 transition-colors" size={16} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-12 pr-4 py-2.5 text-sm focus:border-emerald-500 outline-none transition-all placeholder:text-gray-600"
              placeholder="F2 para buscar produtos..."
            />
          </div>
          <div className="w-full xl:w-auto min-w-[340px]">
            <OrderTypeSelector currentType={fulfillmentType} onTypeChange={setFulfillmentType} />
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {productsLoading ? (
             <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3 animate-pulse">
               {[1,2,3,4,5,6,7,8,9,10,11,12].map(i => <div key={i} className="aspect-[4/5] bg-gray-900 rounded-xl" />)}
             </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} onAdd={addToCart} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========== RIGHT: CART ========== */}
      <div className="w-full md:w-[360px] lg:w-[400px] flex flex-col bg-gray-900 border-l border-gray-800 shadow-2xl z-10">
        {/* Active Session Info */}
        <div className="px-4 py-2 bg-emerald-500/5 flex items-center justify-between border-b border-gray-800/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase text-emerald-500 tracking-wider">Turno: {activeSession.operatorName}</span>
          </div>
          {fulfillmentType === PosFulfillmentType.TABLE && tableNumber && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 rounded-md border border-blue-500/20">
               <span className="text-[9px] font-black text-blue-400 uppercase tracking-tighter">Mesa {tableNumber}</span>
            </div>
          )}
        </div>

        {/* Cart items list - smaller to accommodate address if delivery */}
        <div className={`flex-1 overflow-y-auto px-3 space-y-2 py-2 custom-scrollbar bg-gray-900/50`}>
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-10 py-10 pointer-events-none">
              <ShoppingCart size={48} strokeWidth={1} />
              <p className="font-black mt-2 text-[10px] tracking-widest uppercase">Vazio</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.cartLineId} className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-3">
                <div className="flex justify-between items-start gap-4">
                  <p className="font-bold text-gray-100 text-xs leading-tight line-clamp-1">{item.name}</p>
                  <button onClick={() => removeFromCart(item.cartLineId)} className="text-gray-700 hover:text-red-400"><X size={14} /></button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center bg-gray-950 rounded-lg p-0.5 border border-gray-800">
                    <button onClick={() => updateCartItem(item.cartLineId, { quantity: Math.max(1, item.quantity - 1) })} className="w-6 h-6 text-gray-600 hover:text-white"><Minus size={12} strokeWidth={3} /></button>
                    <span className="w-8 text-center font-black text-xs text-white">{item.quantity}</span>
                    <button onClick={() => updateCartItem(item.cartLineId, { quantity: item.quantity + 1 })} className="w-6 h-6 text-gray-600 hover:text-white"><Plus size={12} strokeWidth={3} /></button>
                  </div>
                  <p className="text-emerald-400 font-black text-sm">{formatCurrency(item.basePrice * item.quantity)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Address / Mesa Fields Section */}
        <div className="bg-gray-950 p-4 border-t border-gray-800 shadow-inner">
           {fulfillmentType === PosFulfillmentType.TABLE ? (
              <div className="relative group">
                <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-400" />
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:border-blue-500 outline-none"
                  placeholder="Número da mesa..."
                />
              </div>
           ) : fulfillmentType === PosFulfillmentType.DELIVERY ? (
              <div className="space-y-2">
                 <div className="flex items-center gap-2 mb-2">
                    <MapPin size={16} className="text-amber-500" />
                    <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Endereço de Entrega</span>
                 </div>
                 <div className="grid grid-cols-4 gap-2">
                    <input 
                      className="col-span-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-[11px] outline-none focus:border-amber-500" 
                      placeholder="Rua / Logradouro"
                      value={deliveryAddress.street}
                      onChange={(e) => setDeliveryAddress({...deliveryAddress, street: e.target.value})}
                      onBlur={calculateFee}
                    />
                    <input 
                      className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-[11px] outline-none focus:border-amber-500" 
                      placeholder="Nº"
                      value={deliveryAddress.number}
                      onChange={(e) => setDeliveryAddress({...deliveryAddress, number: e.target.value})}
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                    <input 
                      className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-[11px] outline-none focus:border-amber-500" 
                      placeholder="Bairro"
                      value={deliveryAddress.neighborhood}
                      onChange={(e) => setDeliveryAddress({...deliveryAddress, neighborhood: e.target.value})}
                      onBlur={calculateFee}
                    />
                    <input 
                      className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-[11px] outline-none focus:border-amber-500" 
                      placeholder="Complemento"
                      value={deliveryAddress.complement}
                      onChange={(e) => setDeliveryAddress({...deliveryAddress, complement: e.target.value})}
                    />
                 </div>
                 <div className="flex items-center justify-between bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                    <div className="flex items-center gap-2">
                       <Truck size={12} className="text-amber-500" />
                       <span className="text-[10px] font-bold text-gray-400">
                         {feeStatus === 'calculating' ? 'Calculando...' : feeStatus === 'error' ? 'Área não atendida' : 'Taxa de Entrega'}
                       </span>
                    </div>
                    <span className={`text-[11px] font-black ${feeStatus === 'error' ? 'text-red-400' : 'text-amber-500'}`}>
                       {feeStatus === 'done' ? formatCurrency(deliveryFee) : '---'}
                    </span>
                 </div>
              </div>
           ) : null}
        </div>

        {/* Footer: Totals */}
        <div className="bg-gray-950 p-4 pt-0 space-y-3">
          <div className="space-y-1">
             <div className="flex justify-between text-[10px] font-semibold text-gray-500 uppercase">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
             </div>
             {deliveryFee > 0 && (
                <div className="flex justify-between text-[10px] font-bold text-amber-500 uppercase">
                  <span>Taxa Entrega</span>
                  <span>{formatCurrency(deliveryFee)}</span>
                </div>
             )}
             {discountTotal > 0 && (
                <div className="flex justify-between text-[10px] font-bold text-red-400 uppercase">
                  <span>Desconto</span>
                  <span>-{formatCurrency(discountTotal)}</span>
                </div>
             )}
             <div className="flex justify-between items-end pt-2">
               <span className="text-xs font-black text-white uppercase tracking-wider">Total</span>
               <span className="text-3xl font-black text-emerald-400 tracking-tighter leading-none italic">
                 {formatCurrency(total)}
               </span>
             </div>
          </div>

          <button
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={cart.length === 0 || createSale.isPending || (fulfillmentType === PosFulfillmentType.DELIVERY && feeStatus !== 'done')}
            className={`w-full py-4 rounded-xl font-black text-base shadow-xl transition-all flex items-center justify-center gap-2 ${cart.length === 0 || (fulfillmentType === PosFulfillmentType.DELIVERY && feeStatus !== 'done') ? 'bg-gray-800 text-gray-600 disabled:cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
          >
            {createSale.isPending ? 'PROCESSANDO...' : 'FECHAR PEDIDO'}
            <ChevronRight size={18} strokeWidth={3} />
          </button>
        </div>
      </div>

      <PaymentModal 
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        total={total}
        subtotal={subtotal}
        discount={discountTotal}
        onConfirm={handleConfirmSale}
        isPending={createSale.isPending}
      />
    </div>
  );
}
