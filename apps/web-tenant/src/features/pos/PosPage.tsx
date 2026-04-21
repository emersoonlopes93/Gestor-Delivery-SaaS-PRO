import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useActiveSession } from '../cash/hooks/useCashSession';
import { useCreatePosSale, type PosCreateSalePayload } from './hooks/usePosSale';
import { useDraftSale } from './hooks/useDraftSale';
import { PosFulfillmentType, PaymentMethod } from '@gestor/types';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  User,
  Store,
  ChevronRight,
  Hash,
  X,
  Keyboard,
  LayoutGrid,
  Save,
  Printer,
  Receipt
} from 'lucide-react';

// New Components
import { OrderTypeSelector } from './components/OrderTypeSelector';
import { ProductCard } from './components/ProductCard';
import { PaymentModal } from './components/PaymentModal';
import { PosSalonView, type SalonTable } from './components/PosSalonView';
import { TransferTableModal } from './components/TransferTableModal';
import { PosItemConfiguratorModal } from './components/PosItemConfiguratorModal';
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
}

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
  const [deliveryFee] = useState(0);
  const [deliveryAddress] = useState({
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
  const [discountTotal] = useState(0);
  const [saleNotes] = useState('');
  const [couponCode] = useState('');
  const [useCashbackAmount] = useState(0);

  // UI Flow
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
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
      const res = await api.get<any>(`/pos/sales/${orderId}/print?type=${type}`);
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
      const res = await api.get(`/crm/customers?search=${customerSearchTerm}&limit=5`);
      const data = res.data as { data: Array<Record<string, any>> };
      return (data.data || []).map(c => ({ id: c.id, name: c.fullName || c.name, phone: c.phone || '' }));
    },
    enabled: customerSearchTerm.length >= 2,
  });

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
        const res = await api.get<any>(`/orders/${table.activeOrderId}`);
        if (res.success && res.data) {
           const order = res.data;
           setCurrentOrderId(order.id);
           setCustomerName(order.customerName);
           setCustomerPhone(order.customerPhone);
           setCart(order.items.map((it: any) => ({
             cartLineId: generateId(),
             lineType: it.lineType,
             productId: it.productId,
             comboId: it.comboId,
             name: it.snapshotName,
             basePrice: it.unitPrice,
             quantity: it.quantity,
             notes: it.notes || ''
           })));
        }
     } else {
        setCurrentOrderId(null);
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
     }
     setViewMode('catalog');
  };

  const subtotal = cart.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);
  const total = Math.max(0, subtotal - discountTotal + deliveryFee);

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
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    fulfillmentType,
    tableNumber: fulfillmentType === PosFulfillmentType.TABLE ? tableNumber : undefined,
    deliveryFee: fulfillmentType === PosFulfillmentType.DELIVERY ? deliveryFee : undefined,
    deliveryAddress: fulfillmentType === PosFulfillmentType.DELIVERY ? deliveryAddress : undefined,
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
    createSale.mutate({ ...getPayload(), paymentMethod: method }, {
      onSuccess: (data) => {
        handlePrint(data.id, 'customer'); // Auto-print customer receipt
        setCart([]); setCurrentOrderId(null); setTableNumber(''); setViewMode('salon'); setIsPaymentModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ['posSalon'] });
      },
    });
  };

  if (sessionLoading) return <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-500 italic uppercase font-black animate-pulse">Carregando Sessão...</div>;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] bg-gray-950 text-gray-100 overflow-hidden font-sans">
      
      {/* ========== LEFT: NAVIGATION ========== */}
      <div className="hidden lg:flex w-16 flex-col bg-gray-900 border-r border-gray-800 py-4 gap-4 items-center">
        <button 
          onClick={() => setViewMode('catalog')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${viewMode === 'catalog' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
          title="Catálogo"
        >
          <Store size={20} />
        </button>
        <button 
          onClick={() => { setViewMode('salon'); queryClient.invalidateQueries({ queryKey: ['posSalon'] }); }}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${viewMode === 'salon' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
          title="Salão"
        >
          <LayoutGrid size={20} />
        </button>
        <div className="w-6 h-[1px] bg-gray-800" />
        <button className="w-10 h-10 bg-gray-800 text-gray-500 rounded-xl flex items-center justify-center hover:text-white transition-colors" title="Configurações">
           <Keyboard size={18} />
        </button>
      </div>

      {/* ========== CENTER: CONTENT ========== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-950">
        {viewMode === 'catalog' ? (
           <>
            <div className="p-3 bg-gray-900 border-b border-gray-800 flex flex-col xl:flex-row gap-3 items-center">
              <div className="relative flex-1 group w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-emerald-500" size={16} />
                <input
                  ref={searchInputRef}
                  type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-12 pr-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition-all"
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
      <div className={`w-full md:w-[380px] lg:w-[420px] flex flex-col bg-gray-900 border-l border-gray-800 shadow-2xl z-10 transition-transform ${viewMode === 'salon' ? 'translate-x-full md:translate-x-0' : ''}`}>
        <div className="px-4 py-3 bg-emerald-500/5 flex items-center justify-between border-b border-gray-800">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-black uppercase text-emerald-500">OPERADOR: {activeSession?.operatorName || 'N/A'}</span>
           </div>
           <div className="flex gap-2">
             {currentOrderId && (
               <>
                <button 
                  onClick={() => handlePrint(currentOrderId!, 'customer')}
                  className="bg-gray-800 text-gray-400 p-1.5 rounded-lg hover:text-white transition-colors"
                  title="Imprimir Cupom"
                >
                  <Receipt size={14} />
                </button>
                <button 
                  onClick={() => handlePrint(currentOrderId!, 'kitchen')}
                  className="bg-gray-800 text-gray-400 p-1.5 rounded-lg hover:text-white transition-colors"
                  title="Imprimir Cozinha"
                >
                  <Printer size={14} />
                </button>
               </>
             )}
             {currentOrderId && (
               <span className="bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-amber-500/20 shadow-sm">Comanda Aberta</span>
             )}
           </div>
        </div>

        <div className="px-4 py-3 bg-gray-850/30 border-b border-gray-800">
           <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-1.5 leading-none">
                 <User size={12} className="text-emerald-500" />
                 {customerName || 'Identificar Cliente'}
              </span>
              <button onClick={() => setShowCustomerSearch(!showCustomerSearch)} className="text-gray-500 hover:text-emerald-500 transition-colors">
                <Search size={16} />
              </button>
           </div>
           
           {showCustomerSearch && (
              <div className="relative mb-3 animate-in fade-in slide-in-from-top-2">
                 <input autoFocus className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white" placeholder="Nome ou Telefone..." value={customerSearchTerm} onChange={(e) => setCustomerSearchTerm(e.target.value)} />
                 {foundCustomers && foundCustomers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-700 rounded-xl mt-1 shadow-2xl z-50">
                       {foundCustomers.map(c => <button key={c.id} onClick={() => { setCustomerName(c.name); setCustomerPhone(c.phone); setShowCustomerSearch(false); }} className="w-full text-left px-4 py-3 hover:bg-gray-750 transition-colors border-b border-gray-700 last:border-0"><p className="font-bold text-xs text-white">{c.name}</p></button>)}
                    </div>
                 )}
              </div>
           )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-900/50 scrollbar-hide">
             {cart.length === 0 ? (
               <div className="h-full flex flex-col items-center justify-center opacity-10">
                  <ShoppingCart size={48} strokeWidth={1} />
                  <p className="font-black mt-2 text-[10px] uppercase">Aguardando Itens</p>
               </div>
             ) : (
               cart.map((item) => (
                <div key={item.cartLineId} className="bg-gray-800/40 border border-gray-800/50 rounded-2xl p-4 group transition-all hover:bg-gray-800/60">
                   <div className="flex justify-between items-start gap-4 mb-3">
                      <p className="font-bold text-gray-100 text-[13px] leading-tight">{item.name}</p>
                      <button onClick={() => removeFromCart(item.cartLineId)} className="text-gray-600 hover:text-red-500 transition-colors"><X size={16} /></button>
                   </div>
                   {item.compositionLabel ? (
                     <div className="text-[10px] text-gray-500 font-bold mb-2 line-clamp-2">
                       {item.compositionLabel}
                     </div>
                   ) : null}
                   <div className="flex items-center justify-between">
                      <div className="flex items-center bg-gray-950 rounded-xl p-1 border border-gray-800/50">
                         <button onClick={() => updateCartItem(item.cartLineId, { quantity: Math.max(1, item.quantity - 1) })} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-white"><Minus size={14} strokeWidth={3} /></button>
                         <span className="w-8 text-center font-black text-sm text-white">{item.quantity}</span>
                         <button onClick={() => updateCartItem(item.cartLineId, { quantity: item.quantity + 1 })} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-white"><Plus size={14} strokeWidth={3} /></button>
                      </div>
                      <p className="text-emerald-400 font-extrabold text-lg">{formatCurrency(item.basePrice * item.quantity)}</p>
                   </div>
                </div>
              ))
            )}
        </div>

        <div className="p-4 bg-gray-950 space-y-4 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
            {fulfillmentType === PosFulfillmentType.TABLE && (
               <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"><Hash size={14} /></span>
                    <input className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-3 text-xs font-bold text-white outline-none focus:border-blue-500" placeholder="Nº Mesa" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} />
                  </div>
                  <button 
                    onClick={handleSaveDraft}
                    disabled={!tableNumber || cart.length === 0 || upsertDraft.isPending}
                    className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/20 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-30"
                  >
                     <Save size={14} />
                     {upsertDraft.isPending ? 'Salvando...' : 'Lançar Comanda'}
                  </button>
               </div>
            )}

            <div className="space-y-1.5 border-t border-gray-800/50 pt-3">
               <div className="flex justify-between text-[11px] font-bold text-gray-500 uppercase tracking-tighter">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
               </div>
               <div className="flex justify-between items-end">
                  <span className="text-sm font-black text-white uppercase italic">Total Líquido</span>
                  <span className="text-4xl font-black text-emerald-400 tracking-tighter italic leading-none">{formatCurrency(total)}</span>
               </div>
            </div>

            <button 
              onClick={() => setIsPaymentModalOpen(true)}
              disabled={cart.length === 0 || createSale.isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-900/20 flex items-center justify-center gap-2 text-base transition-all active:scale-95 disabled:bg-gray-800 disabled:text-gray-600"
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
    </div>
  );
}
