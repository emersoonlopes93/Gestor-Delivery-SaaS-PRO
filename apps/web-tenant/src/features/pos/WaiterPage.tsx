import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useDraftSale } from './hooks/useDraftSale';
import { PosFulfillmentType } from '@gestor/types';
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  LayoutGrid,
  Store,
  X,
  Receipt,
  Printer
} from 'lucide-react';

// Reusing existing components
import { ProductCard } from './components/ProductCard';
import { PosSalonView, type SalonTable } from './components/PosSalonView';
import { TransferTableModal } from './components/TransferTableModal';

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

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export default function WaiterPage() {
  const queryClient = useQueryClient();
  const upsertDraft = useDraftSale();

  // Navigation Logic
  const [viewMode, setViewMode] = useState<'catalog' | 'salon'>('salon');

  // Core State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [sourceTableForTransfer, setSourceTableForTransfer] = useState<SalonTable | null>(null);

  const handleTransferTable = useCallback((table: SalonTable) => {
    setSourceTableForTransfer(table);
    setIsTransferModalOpen(true);
  }, []);

  // Queries
  const { data: products } = useQuery<CatalogProduct[]>({
    queryKey: ['posCatalog'],
    queryFn: async () => {
      const res = await api.get(`/catalog/products?limit=100`);
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
  });

  const categories = useMemo(() => {
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
    const isCombo = product.type === 'combo';
    setCart((prev) => [...prev, {
        cartLineId: generateId(),
        lineType: isCombo ? 'combo' : 'product',
        ...(isCombo ? { comboId: product.id } : { productId: product.id }),
        name: product.name, basePrice: product.basePrice, quantity: 1, notes: '',
    }]);
  }, []);

  const updateCartItem = (lineId: string, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((item) => item.cartLineId === lineId ? { ...item, ...updates } : item));
  };

  const removeFromCart = (lineId: string) => {
    setCart((prev) => prev.filter((item) => item.cartLineId !== lineId));
  };

  const handleSelectTable = async (table: SalonTable) => {
     setTableNumber(table.name);
     setSelectedTableId(table.id);
     
     if (table.activeOrderId) {
        const res = await api.get<any>(`/orders/${table.activeOrderId}`);
        if (res.success && res.data) {
           const order = res.data;
           setCurrentOrderId(order.id);
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
     }
     setViewMode('catalog');
  };

  const handleSaveDraft = () => {
    if (cart.length === 0) return;
    const payload = {
        id: currentOrderId || undefined,
        idempotencyKey: generateId(),
        items: cart.map((item) => ({
          lineType: item.lineType,
          ...(item.lineType === 'product' ? { productId: item.productId } : { comboId: item.comboId }),
          quantity: item.quantity,
          notes: item.notes || undefined,
        })),
        fulfillmentType: PosFulfillmentType.TABLE,
        tableNumber,
        paymentMethod: 'cash' as any, // Placeholder for draft
        waiterId: undefined // Let server handle current operator
    };

    upsertDraft.mutate(payload, {
        onSuccess: (data) => {
            setCurrentOrderId(data.id);
            // Optional: Print to kitchen automatically
            api.get(`/pos/sales/${data.id}/print?type=kitchen`);
            setViewMode('salon');
            queryClient.invalidateQueries({ queryKey: ['posSalon'] });
        }
    });
  };

  const handleRequestBill = async () => {
    if (!selectedTableId) return;
    try {
      await api.post(`/pos/tables/${selectedTableId}/bill`, {});
      setViewMode('salon');
      queryClient.invalidateQueries({ queryKey: ['posSalon'] });
    } catch (err) {
      console.error('Error requesting bill:', err);
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-950 text-gray-100 overflow-hidden">
      
      {/* Top Header Mobile */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between shadow-lg">
         <div className="flex items-center gap-3">
            <button 
              onClick={() => setViewMode('salon')}
              className={`p-2 rounded-xl transition-all ${viewMode === 'salon' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-800 text-gray-400'}`}
            >
               <LayoutGrid size={20} />
            </button>
            <button 
              onPointerDown={() => setViewMode('catalog')}
              className={`p-2 rounded-xl transition-all ${viewMode === 'catalog' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-gray-800 text-gray-400'}`}
            >
               <Store size={20} />
            </button>
         </div>
         
         <div className="flex items-center gap-2">
            {tableNumber && (
              <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">
                Mesa: {tableNumber}
              </span>
            )}
            {upsertDraft.isPending && <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />}
         </div>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col">
        {viewMode === 'salon' ? (
          <PosSalonView 
            tables={salonTables || []} 
            isLoading={salonLoading} 
            onSelectTable={handleSelectTable} 
            onTransferTable={handleTransferTable}
          />
        ) : (
          <div className="flex flex-col h-full">
            {/* Catalog & Cart combined for mobile */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
               {/* Left: Products */}
               <div className="flex-1 flex flex-col min-w-0 bg-gray-950 border-r border-gray-900">
                  <div className="p-3 bg-gray-900/50 border-b border-gray-800 flex gap-2 overflow-x-auto scrollbar-hide py-3">
                     <button 
                       onClick={() => setSelectedCategoryId(null)}
                       className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap transition-all ${!selectedCategoryId ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                     >
                        Tudo
                     </button>
                     {categories.map(cat => (
                        <button 
                          key={cat.id}
                          onClick={() => setSelectedCategoryId(cat.id)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap transition-all ${selectedCategoryId === cat.id ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                        >
                           {cat.name}
                        </button>
                     ))}
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {filteredProducts.map(p => (
                           <div key={p.id} className="relative active:scale-95 transition-transform" onClick={() => addToCart(p)}>
                              <ProductCard product={p} onAdd={() => {}} />
                              <div className="absolute top-2 right-2 bg-emerald-500 text-white p-1 rounded-lg">
                                <Plus size={14} />
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>

               {/* Right: Cart (Sticky Bottom on mobile) */}
               <div className="h-[280px] md:h-full md:w-[320px] bg-gray-900 flex flex-col shadow-2xl border-t md:border-t-0 md:border-l border-gray-800">
                  <div className="px-4 py-3 bg-gray-850/50 flex items-center justify-between border-b border-gray-800">
                     <span className="text-[10px] font-black uppercase text-gray-500 dark:text-gray-400 tracking-widest leading-none">Comanda do Pedido</span>
                     <button onClick={() => setViewMode('salon')} className="text-gray-500 dark:text-gray-400 hover:text-white"><X size={16} /></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                     {cart.length === 0 ? (
                       <div className="h-full flex flex-col items-center justify-center opacity-10">
                          <ShoppingCart size={48} strokeWidth={1} />
                       </div>
                     ) : (
                       cart.map((item) => (
                         <div key={item.cartLineId} className="bg-gray-800/40 border border-gray-800/50 rounded-xl p-3 flex justify-between items-center">
                            <div className="min-w-0 flex-1 pr-2">
                               <p className="font-bold text-gray-100 text-[11px] truncate leading-tight">{item.name}</p>
                               <p className="text-emerald-400 font-extrabold text-[13px]">{formatCurrency(item.basePrice * item.quantity)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                               <div className="flex items-center bg-gray-950 rounded-lg p-0.5 border border-gray-800">
                                  <button onClick={() => updateCartItem(item.cartLineId, { quantity: Math.max(1, item.quantity - 1) })} className="w-6 h-6 flex items-center justify-center text-gray-500 dark:text-gray-400"><Minus size={12} /></button>
                                  <span className="w-6 text-center text-xs font-black">{item.quantity}</span>
                                  <button onClick={() => updateCartItem(item.cartLineId, { quantity: item.quantity + 1 })} className="w-6 h-6 flex items-center justify-center text-gray-500 dark:text-gray-400"><Plus size={12} /></button>
                               </div>
                               <button onClick={() => removeFromCart(item.cartLineId)} className="text-gray-700 dark:text-gray-300 hover:text-red-500"><X size={14} /></button>
                            </div>
                         </div>
                       ))
                     )}
                  </div>

                  <div className="p-4 bg-gray-950 border-t border-gray-800 flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase italic">Subtotal</span>
                        <span className="text-lg font-black text-emerald-400 tracking-tighter italic">{formatCurrency(subtotal)}</span>
                     </div>
                     
                     <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={handleRequestBill}
                          disabled={!currentOrderId}
                          className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 rounded-xl py-3 text-[10px] font-black uppercase flex items-center justify-center gap-2 transition-all disabled:opacity-20"
                        >
                           <Receipt size={14} />
                           Conta
                        </button>
                        <button 
                          onClick={handleSaveDraft}
                          disabled={cart.length === 0 || upsertDraft.isPending}
                          className="flex-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl shadow-xl flex items-center justify-center gap-2 text-[11px] transition-all disabled:bg-gray-800 disabled:text-gray-600 dark:text-gray-400 uppercase tracking-widest"
                        >
                           <Printer size={14} />
                           {upsertDraft.isPending ? 'Lançando...' : 'Cozinha'}
                        </button>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Menu (Mobile) */}
      {viewMode === 'catalog' && cart.length > 0 && (
         <div className="md:hidden fixed bottom-32 right-4 z-50">
            <div className="bg-emerald-500 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl relative">
                <ShoppingCart size={24} />
                <span className="absolute -top-1 -right-1 bg-white dark:bg-gray-900 text-emerald-600 border-2 border-emerald-500 w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center">
                   {cart.reduce((a,b) => a+b.quantity, 0)}
                </span>
            </div>
         </div>
      )}

      {sourceTableForTransfer && (
        <TransferTableModal 
          isOpen={isTransferModalOpen}
          onClose={() => {
            setIsTransferModalOpen(false);
            setSourceTableForTransfer(null);
          }}
          sourceTableId={sourceTableForTransfer.id}
          sourceTableName={sourceTableForTransfer.name}
          availableTables={salonTables?.map(t => ({ id: t.id, name: t.name, status: t.status })) || []}
        />
      )}
    </div>
  );
}
