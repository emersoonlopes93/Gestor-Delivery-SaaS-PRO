import { useState, useCallback, useEffect, useMemo } from 'react';
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
  ChevronRight
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

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export default function PosPage() {
  const { data: activeSession, isLoading: sessionLoading } = useActiveSession();
  const createSale = useCreatePosSale();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<PosFulfillmentType>(PosFulfillmentType.DINE_IN);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discountTotal, setDiscountTotal] = useState(0);
  const [saleNotes, setSaleNotes] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [useCashbackAmount, setUseCashbackAmount] = useState(0);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [saleCompleted, setSaleCompleted] = useState(false);

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

  const subtotal = cart.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);
  const total = Math.max(0, subtotal - discountTotal);

  useEffect(() => {
    if (saleCompleted) {
      const timer = setTimeout(() => setSaleCompleted(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saleCompleted]);

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
      <div className="flex items-center justify-center h-full min-h-[80vh] bg-gray-950 p-6">
        <div className="bg-gray-900 rounded-[2.5rem] p-10 border border-amber-900/30 text-center max-w-md shadow-2xl">
          <div className="w-20 h-20 bg-amber-500/10 text-amber-500 rounded-3xl flex items-center justify-center mx-auto mb-6 border-2 border-amber-500/20">
            <Wallet size={40} />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Caixa Fechado</h2>
          <p className="text-gray-500 mb-8 px-4">
            É necessário abrir um turno de caixa antes de iniciar as operações de venda.
          </p>
          <a href="/cash" className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-emerald-900/20">
            Ir para Gestão de Caixa
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] bg-gray-950 text-gray-100 overflow-hidden font-sans">
      
      {/* ========== LEFT: SIDEBAR CATEGORIES (Desktop Only) ========== */}
      <div className="hidden lg:flex w-20 flex-col bg-gray-900 border-r border-gray-800 py-4 gap-4 items-center">
        <button 
          onClick={() => setSelectedCategoryId(null)}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${!selectedCategoryId ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
          title="Todos os Produtos"
        >
          <Store size={22} />
        </button>
        <div className="w-8 h-[2px] bg-gray-800 rounded-full" />
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategoryId(cat.id)}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${selectedCategoryId === cat.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
            title={cat.name}
          >
            <span className="text-[10px] font-black uppercase overflow-hidden text-center leading-tight">
              {cat.name.substring(0, 3)}
            </span>
          </button>
        ))}
      </div>

      {/* ========== CENTER: CATALOG ========== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header / Search */}
        <div className="p-4 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800/50 flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-emerald-500 transition-colors" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-700 rounded-2xl pl-12 pr-4 py-3 text-sm focus:border-emerald-500 outline-none transition-all placeholder:text-gray-600"
              placeholder="Buscar por nome, categoria ou código..."
            />
          </div>
          <div className="w-full sm:w-auto min-w-[280px]">
            <OrderTypeSelector currentType={fulfillmentType} onTypeChange={setFulfillmentType} />
          </div>
        </div>

        {/* Categories Bar (Mobile/Tablet Only) */}
        <div className="lg:hidden flex overflow-x-auto p-3 gap-2 border-b border-gray-800 no-scrollbar">
          <button 
            onClick={() => setSelectedCategoryId(null)}
            className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all ${!selectedCategoryId ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Todos
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedCategoryId === cat.id ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-400'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {productsLoading ? (
             <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
               {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="aspect-[4/5] bg-gray-800 rounded-2xl" />)}
             </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} onAdd={addToCart} />
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-full py-20 text-center text-gray-700 flex flex-col items-center">
                  <ShoppingCart size={64} strokeWidth={1} className="mb-4 opacity-20" />
                  <p className="text-xl font-bold">Nenhum produto encontrado</p>
                  <p className="text-sm">Tente mudar a categoria ou termo de busca</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========== RIGHT: CART ========== */}
      <div className="w-full md:w-[380px] lg:w-[420px] flex flex-col bg-gray-900 border-l border-gray-800 shadow-2xl z-10 transition-all">
        {/* Status indicator */}
        <div className="px-6 py-3 bg-emerald-500/5 flex items-center justify-between border-b border-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping absolute inset-0" />
              <div className="w-3 h-3 rounded-full bg-emerald-500 relative" />
            </div>
            <span className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Atendimento Ativo</span>
          </div>
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">{activeSession.operatorName}</span>
        </div>

        {/* Success Alert */}
        {saleCompleted && (
          <div className="bg-emerald-500 text-white px-6 py-4 flex items-center gap-3 animate-in fade-in slide-in-from-top duration-300">
            <CheckCircle2 size={24} />
            <span className="font-bold text-sm uppercase">Venda Registrada com Sucesso!</span>
          </div>
        )}

        {/* Cart Title & Items count */}
        <div className="p-6 pb-2 flex justify-between items-end">
          <h2 className="text-2xl font-black text-white tracking-tight">Carrinho</h2>
          <span className="text-xs font-bold text-gray-500 uppercase pb-1">{cart.length} itens</span>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto px-4 space-y-3 py-2 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-10 py-20 pointer-events-none">
              <ShoppingCart size={80} strokeWidth={1} />
              <p className="font-black mt-4 uppercase text-xs tracking-[0.3em]">CARRINHO VAZIO</p>
            </div>
          ) : (
            cart.map((item) => (
              <div 
                key={item.cartLineId} 
                className="bg-gray-800/50 border border-gray-700/50 rounded-[1.25rem] p-4 group transition-all hover:bg-gray-800 hover:border-gray-600"
              >
                <div className="flex justify-between items-start gap-4">
                  <p className="font-bold text-white text-sm leading-tight line-clamp-2">{item.name}</p>
                  <button
                    onClick={() => removeFromCart(item.cartLineId)}
                    className="text-gray-600 hover:text-red-400 p-1 rounded-lg hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center bg-gray-900 rounded-xl p-1 border border-gray-700">
                    <button
                      onClick={() => updateCartItem(item.cartLineId, { quantity: Math.max(1, item.quantity - 1) })}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    ><Minus size={14} strokeWidth={3} /></button>
                    <span className="w-10 text-center font-black text-sm text-white">{item.quantity}</span>
                    <button
                      onClick={() => updateCartItem(item.cartLineId, { quantity: item.quantity + 1 })}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    ><Plus size={14} strokeWidth={3} /></button>
                  </div>
                  <p className="text-emerald-400 font-black text-lg">
                    {formatCurrency(item.basePrice * item.quantity)}
                  </p>
                </div>

                <div className="mt-3 relative flex items-center group/note">
                  <FileText size={12} className="absolute left-3 text-gray-600 group-focus-within/note:text-emerald-500" />
                  <input
                    type="text"
                    value={item.notes}
                    onChange={(e) => updateCartItem(item.cartLineId, { notes: e.target.value })}
                    className="w-full bg-gray-900/50 border border-transparent rounded-xl pl-9 pr-3 py-2 text-[11px] text-gray-400 focus:text-white focus:border-gray-600 outline-none transition-all placeholder:text-gray-700"
                    placeholder="Adicionar observação..."
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: Forms & Totals */}
        <div className="bg-gray-950 p-6 space-y-4 border-t border-gray-800 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
          
          {/* Customer Toggle / Form */}
          <div className="flex gap-2">
            <div className="flex-1 relative group">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:border-emerald-500 outline-none transition-all"
                placeholder="Cliente"
              />
            </div>
            <div className="w-[120px] relative group">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:border-emerald-500 outline-none transition-all"
                placeholder="Telefone"
              />
            </div>
          </div>

          {/* Collapsible details? No, keep it functional for speed. */}
          <div className="grid grid-cols-2 gap-2">
             <div className="relative">
                <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2 text-[10px] text-white focus:border-indigo-500 outline-none transition-all"
                  placeholder="CUPOM"
                />
             </div>
             <div className="flex flex-col">
                <input
                  type="number"
                  step="0.01"
                  value={discountTotal || ''}
                  onChange={(e) => setDiscountTotal(parseFloat(e.target.value) || 0)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-[10px] text-amber-500 font-bold focus:border-amber-500 outline-none transition-all"
                  placeholder="DESC. MANUAL R$"
                />
             </div>
          </div>

          {/* Totals Summary */}
          <div className="space-y-1 pt-2">
             <div className="flex justify-between text-[10px] font-black uppercase text-gray-500 tracking-widest">
               <span>Subtotal</span>
               <span>{formatCurrency(subtotal)}</span>
             </div>
             {discountTotal > 0 && (
               <div className="flex justify-between text-[10px] font-black uppercase text-amber-500 tracking-widest">
                 <span>Descontos</span>
                 <span>-{formatCurrency(discountTotal)}</span>
               </div>
             )}
             <div className="flex justify-between items-center pt-2">
               <span className="text-sm font-black text-white uppercase tracking-wider">Total</span>
               <span className="text-3xl font-black text-emerald-400 tracking-tight leading-none">
                 {formatCurrency(total)}
               </span>
             </div>
          </div>

          {/* Checkout Button */}
          <button
            onClick={() => setIsPaymentModalOpen(true)}
            disabled={cart.length === 0 || createSale.isPending}
            className={`
              w-full py-4 rounded-[1.5rem] font-black text-lg tracking-tight shadow-xl shadow-emerald-950/20 transition-all flex items-center justify-center gap-3
              ${cart.length === 0 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/20 active:scale-95'}
            `}
          >
            {createSale.isPending ? 'REGISTRANDO...' : 'FECHAR PEDIDO'}
            <ChevronRight size={20} strokeWidth={3} />
          </button>

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
