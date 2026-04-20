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
  Keyboard
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
      // Simulated API call or filter existing customers
      // For now, let's pretend we have a few customers
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
  const total = Math.max(0, subtotal - discountTotal);

  const handleSelectCustomer = (c: CustomerResult) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerSearchTerm('');
    setShowCustomerSearch(false);
  };

  const handleConfirmSale = (method: PaymentMethod, _details?: any) => {
    if (cart.length === 0 || !activeSession) return;

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
      
      {/* ========== LEFT: SIDEBAR CATEGORIES (Desktop Only) ========== */}
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
        
        <div className="mt-auto flex flex-col gap-2">
           <button title="Atalhos de Teclado" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-700 hover:text-white transition-colors">
             <Keyboard size={16} />
           </button>
        </div>
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

        {/* Categories Bar (Mobile/Tablet Only) */}
        <div className="lg:hidden flex overflow-x-auto p-2 gap-2 border-b border-gray-800 no-scrollbar bg-gray-900">
          <button 
            onClick={() => setSelectedCategoryId(null)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${!selectedCategoryId ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-500'}`}
          >
            Todos
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${selectedCategoryId === cat.id ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-500'}`}
            >
              {cat.name}
            </button>
          ))}
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
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-20 text-center text-gray-800 flex flex-col items-center">
                  <ShoppingCart size={48} strokeWidth={1} className="mb-4 opacity-10" />
                  <p className="text-lg font-bold">Sem produtos</p>
                  <p className="text-xs">Tente outro termo</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========== RIGHT: CART ========== */}
      <div className="w-full md:w-[360px] lg:w-[400px] flex flex-col bg-gray-900 border-l border-gray-800 shadow-2xl z-10">
        {/* Active Session Info (Slim) */}
        <div className="px-4 py-2 bg-emerald-500/5 flex items-center justify-between border-b border-gray-800/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black uppercase text-emerald-500 tracking-wider">Turno: {activeSession.operatorName}</span>
          </div>
          {fulfillmentType === PosFulfillmentType.TABLE && tableNumber && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 rounded-md border border-blue-500/20">
               <Hash size={10} className="text-blue-400" />
               <span className="text-[10px] font-black text-blue-400 uppercase">Mesa {tableNumber}</span>
            </div>
          )}
        </div>

        {/* Cart Title & Header */}
        <div className="p-4 flex justify-between items-center group">
          <h2 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
            <ShoppingCart size={18} className="text-emerald-500" />
            Carrinho
          </h2>
          <button 
            onClick={clearCart}
            disabled={cart.length === 0}
            className="text-[10px] font-bold text-gray-600 hover:text-red-400 uppercase flex items-center gap-1.5 transition-colors disabled:opacity-0"
          >
            <Trash2 size={12} />
            Limpar
          </button>
        </div>

        {/* Mesa Input (Conditional) */}
        {fulfillmentType === PosFulfillmentType.TABLE && (
           <div className="px-4 pb-3 animate-in slide-in-from-top-2 duration-300">
             <div className="relative group">
                <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition-all placeholder:text-gray-700"
                  placeholder="Número da mesa..."
                  autoFocus
                />
             </div>
           </div>
        )}

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-2 py-1 custom-scrollbar bg-gray-900/50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-10 py-10 pointer-events-none">
              <ShoppingCart size={48} strokeWidth={1} />
              <p className="font-black mt-2 text-[10px] tracking-widest uppercase">Vazio</p>
            </div>
          ) : (
            cart.map((item) => (
              <div 
                key={item.cartLineId} 
                className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-3 group transition-all hover:bg-gray-800"
              >
                <div className="flex justify-between items-start gap-4">
                  <p className="font-bold text-gray-100 text-xs leading-tight line-clamp-1">{item.name}</p>
                  <button
                    onClick={() => removeFromCart(item.cartLineId)}
                    className="text-gray-700 hover:text-red-400 p-0.5 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                
                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center bg-gray-950 rounded-lg p-0.5 border border-gray-800">
                    <button
                      onClick={() => updateCartItem(item.cartLineId, { quantity: Math.max(1, item.quantity - 1) })}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-gray-600 hover:text-white hover:bg-gray-800 transition-colors"
                    ><Minus size={12} strokeWidth={3} /></button>
                    <span className="w-8 text-center font-black text-xs text-white">{item.quantity}</span>
                    <button
                      onClick={() => updateCartItem(item.cartLineId, { quantity: item.quantity + 1 })}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-gray-600 hover:text-white hover:bg-gray-800 transition-colors"
                    ><Plus size={12} strokeWidth={3} /></button>
                  </div>
                  <p className="text-emerald-400 font-black text-sm">
                    {formatCurrency(item.basePrice * item.quantity)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: Identification & Totals */}
        <div className="bg-gray-950 p-4 space-y-3 border-t border-gray-800 shadow-2xl">
          
          {/* Customer Self-Identification / Search */}
          <div className="space-y-2">
            <div className="relative group">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                value={customerSearchTerm || customerName}
                onChange={(e) => {
                  setCustomerSearchTerm(e.target.value);
                  if (!showCustomerSearch) setShowCustomerSearch(true);
                  if (customerName) setCustomerName(''); // Clear manual if searching
                }}
                onFocus={() => setShowCustomerSearch(true)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:border-emerald-500 outline-none transition-all"
                placeholder="Cliente (Nome ou Tel)..."
              />
              { (customerName || customerSearchTerm) && (
                <button 
                  onClick={() => { setCustomerName(''); setCustomerPhone(''); setCustomerSearchTerm(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white"
                >
                  <X size={12} />
                </button>
              )}

              {/* Autocomplete Dropdown */}
              {showCustomerSearch && foundCustomers && foundCustomers.length > 0 && (
                <div className="absolute bottom-full mb-2 left-0 right-0 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="p-2 border-b border-gray-800">
                    <span className="text-[9px] font-black uppercase text-gray-600 px-2 tracking-widest">Resultados da Busca</span>
                  </div>
                  {foundCustomers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-emerald-500/10 text-left transition-colors group"
                    >
                      <div>
                        <p className="text-xs font-bold text-white group-hover:text-emerald-400">{c.name}</p>
                        <p className="text-[10px] text-gray-500">{c.phone}</p>
                      </div>
                      <ChevronRight size={14} className="text-gray-700 group-hover:text-emerald-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Manual Phone Input if no customer selected */}
            {!customerName && (
              <div className="relative group animate-in fade-in duration-300">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:border-emerald-500 outline-none transition-all"
                  placeholder="Telefone Manual..."
                />
              </div>
            )}
            
            {customerName && (
               <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 animate-in zoom-in-95 duration-200">
                 <User size={12} />
                 <span className="text-xs font-bold truncate">{customerName}</span>
                 <span className="text-[10px] opacity-70 ml-auto">{customerPhone}</span>
               </div>
            )}
          </div>

          <div className="h-[1px] bg-gray-900" />

          {/* Totals Summary (Ultra Compact) */}
          <div className="space-y-1">
             <div className="flex justify-between text-[9px] font-black uppercase text-gray-600 tracking-wider">
               <span>Subtotal</span>
               <span>{formatCurrency(subtotal)}</span>
             </div>
             {discountTotal > 0 && (
                <div className="flex justify-between text-[9px] font-black uppercase text-amber-500">
                  <span>Desconto</span>
                  <span>-{formatCurrency(discountTotal)}</span>
                </div>
             )}
             <div className="flex justify-between items-end pt-1">
               <span className="text-xs font-black text-white uppercase tracking-wider mb-1">Total</span>
               <span className="text-3xl font-black text-emerald-400 tracking-tighter leading-none italic">
                 {formatCurrency(total)}
               </span>
             </div>
          </div>

          {/* Checkout Button */}
          <button
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={cart.length === 0 || createSale.isPending}
            className={`
              w-full py-3.5 rounded-xl font-black text-base tracking-tighter shadow-xl transition-all flex items-center justify-center gap-2 group
              ${cart.length === 0 ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'}
            `}
          >
            {createSale.isPending ? 'PROCESSANDO...' : 'FECHAR PEDIDO'}
            <ChevronRight size={18} strokeWidth={3} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
          
          <div className="flex justify-center">
             <span className="text-[9px] text-gray-700 font-bold uppercase tracking-widest">Atalho: F4</span>
          </div>

          {createSale.isError && (
            <p className="text-red-400 text-[10px] font-bold text-center animate-bounce uppercase">
              {(createSale.error as Error).message}
            </p>
          )}
        </div>
      </div>

      {/* ========== PAYMENT MODAL ========== */}
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

const CheckCircle2 = (props: any) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
