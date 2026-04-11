import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useActiveSession } from '../cash/hooks/useCashSession';
import { useCreatePosSale, type PosCreateSalePayload } from './hooks/usePosSale';

interface CatalogProduct {
  id: string;
  name: string;
  basePrice: number;
  image: string | null;
  categoryName: string;
}

interface CartItem {
  cartLineId: string;
  productId: string;
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

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Crédito' },
  { value: 'debit_card', label: 'Débito' },
  { value: 'other', label: 'Outro' },
] as const;

const FULFILLMENT_TYPES = [
  { value: 'dine_in', label: 'Balcão' },
  { value: 'pickup', label: 'Retirada' },
] as const;

export default function PosPage() {
  const { data: activeSession, isLoading: sessionLoading } = useActiveSession();
  const createSale = useCreatePosSale();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosCreateSalePayload['paymentMethod']>('cash');
  const [fulfillmentType, setFulfillmentType] = useState<PosCreateSalePayload['fulfillmentType']>('dine_in');
  const [discountTotal, setDiscountTotal] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [saleCompleted, setSaleCompleted] = useState(false);
  
  const [couponCode, setCouponCode] = useState('');
  const [useCashbackAmount, setUseCashbackAmount] = useState(0);

  // Fetch products for the catalog
  const { data: products } = useQuery<CatalogProduct[]>({
    queryKey: ['posCatalog', searchTerm],
    queryFn: async () => {
      const res = await api.get(`/catalog/products?search=${encodeURIComponent(searchTerm)}&limit=50`);
      const data = res.data as { data: Array<Record<string, unknown>> };
      return (data.data || []).map((p: Record<string, unknown>) => ({
        id: p['id'] as string,
        name: p['name'] as string,
        basePrice: Number(p['basePrice'] ?? p['base_price'] ?? 0),
        image: (p['image'] as string | null) || null,
        categoryName: ((p['category'] as Record<string, unknown>)?.['name'] as string) || '',
      }));
    },
    refetchOnWindowFocus: false,
  });

  // Add product to cart
  const addToCart = useCallback((product: CatalogProduct) => {
    setCart((prev) => [
      ...prev,
      {
        cartLineId: generateId(),
        productId: product.id,
        name: product.name,
        basePrice: product.basePrice,
        quantity: 1,
        notes: '',
      },
    ]);
  }, []);

  // Update cart item
  const updateCartItem = useCallback((lineId: string, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((item) => item.cartLineId === lineId ? { ...item, ...updates } : item));
  }, []);

  // Remove from cart
  const removeFromCart = useCallback((lineId: string) => {
    setCart((prev) => prev.filter((item) => item.cartLineId !== lineId));
  }, []);

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);
  const total = Math.max(0, subtotal - discountTotal);

  // Reset sale state after completion
  useEffect(() => {
    if (saleCompleted) {
      const timer = setTimeout(() => setSaleCompleted(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saleCompleted]);

  // Finalize sale
  const handleFinalize = () => {
    if (cart.length === 0 || !activeSession) return;

    const payload: PosCreateSalePayload = {
      idempotencyKey: generateId(),
      items: cart.map((item) => ({
        lineType: 'product' as const,
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes || undefined,
      })),
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      fulfillmentType,
      paymentMethod,
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
      },
    });
  };

  if (sessionLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div>;
  }

  // Block if no cash session
  if (!activeSession) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="bg-gray-800 rounded-xl p-8 border border-yellow-700 text-center max-w-md">
          <div className="text-4xl mb-3">💰</div>
          <h2 className="text-xl font-bold text-yellow-400 mb-2">Caixa Fechado</h2>
          <p className="text-gray-400 mb-4">
            É necessário abrir um caixa antes de usar o PDV.
          </p>
          <a href="/cash" className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-2 rounded-lg transition-colors">
            Ir para o Caixa
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden">
      {/* ========== LEFT: CATALOG ========== */}
      <div className="flex-1 flex flex-col border-r border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white mb-3">PDV — Ponto de Venda</h1>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
            placeholder="Buscar produto..."
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {(products || []).map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-emerald-500 rounded-xl p-4 text-left transition-all group"
              >
                <p className="font-medium text-white group-hover:text-emerald-400 truncate">{product.name}</p>
                <p className="text-xs text-gray-500 mt-1">{product.categoryName}</p>
                <p className="text-emerald-400 font-bold mt-2">{formatCurrency(product.basePrice)}</p>
              </button>
            ))}
            {products && products.length === 0 && (
              <p className="text-gray-500 col-span-full text-center py-8">Nenhum produto encontrado.</p>
            )}
          </div>
        </div>
      </div>

      {/* ========== RIGHT: CART / ORDER ========== */}
      <div className="w-[400px] flex flex-col bg-gray-900">
        {/* Cash session indicator */}
        <div className="px-4 py-2 bg-emerald-900/30 border-b border-emerald-800 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-400">Caixa aberto · {activeSession.operatorName}</span>
        </div>

        {/* Success message */}
        {saleCompleted && (
          <div className="px-4 py-3 bg-emerald-800/50 border-b border-emerald-700 text-center">
            <p className="text-emerald-300 font-medium">✅ Venda registrada com sucesso!</p>
          </div>
        )}

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <p className="text-gray-500 text-center py-12">Adicione itens ao carrinho</p>
          ) : (
            cart.map((item) => (
              <div key={item.cartLineId} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="flex justify-between items-start">
                  <p className="font-medium text-white text-sm flex-1">{item.name}</p>
                  <button
                    onClick={() => removeFromCart(item.cartLineId)}
                    className="text-red-400 hover:text-red-300 text-sm ml-2"
                  >✕</button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => updateCartItem(item.cartLineId, { quantity: Math.max(1, item.quantity - 1) })}
                    className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm flex items-center justify-center"
                  >−</button>
                  <span className="text-white font-mono text-sm w-6 text-center">{item.quantity}</span>
                  <button
                    onClick={() => updateCartItem(item.cartLineId, { quantity: item.quantity + 1 })}
                    className="w-7 h-7 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm flex items-center justify-center"
                  >+</button>
                  <span className="ml-auto text-emerald-400 font-medium text-sm">
                    {formatCurrency(item.basePrice * item.quantity)}
                  </span>
                </div>
                <input
                  type="text"
                  value={item.notes}
                  onChange={(e) => updateCartItem(item.cartLineId, { notes: e.target.value })}
                  className="mt-2 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:outline-none"
                  placeholder="Observação..."
                />
              </div>
            ))
          )}
        </div>

        {/* Order config & totals */}
        <div className="border-t border-gray-700 p-4 space-y-3 bg-gray-850">
          {/* Customer */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              placeholder="Nome do cliente (opcional)"
            />
            <input
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-1/3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
              placeholder="Telefone"
            />
          </div>

          {/* Fulfillment & Payment */}
          <div className="flex gap-2">
            <select
              value={fulfillmentType}
              onChange={(e) => setFulfillmentType(e.target.value as PosCreateSalePayload['fulfillmentType'])}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            >
              {FULFILLMENT_TYPES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PosCreateSalePayload['paymentMethod'])}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Commercial & Discount */}
          <div className="gap-2 grid grid-cols-2">
            <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1">Cupom Aval.</label>
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                placeholder="Código"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-400 mb-1">Usar Cashback R$</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={useCashbackAmount || ''}
                onChange={(e) => setUseCashbackAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col col-span-2">
              <label className="text-xs text-gray-400 mb-1">Desconto Manual PDV R$</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={discountTotal || ''}
                onChange={(e) => setDiscountTotal(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Notes */}
          <input
            type="text"
            value={saleNotes}
            onChange={(e) => setSaleNotes(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            placeholder="Obs. da venda (opcional)"
          />

          {/* Totals */}
          <div className="space-y-1 text-sm pt-2 border-t border-gray-700">
            <div className="flex justify-between text-gray-400">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountTotal > 0 && (
              <div className="flex justify-between text-yellow-400">
                <span>Desc. Manual</span>
                <span>-{formatCurrency(discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-white pt-1">
              <span>Total</span>
              <span className="text-emerald-400">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Finalize */}
          <button
            onClick={handleFinalize}
            disabled={cart.length === 0 || createSale.isPending}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-colors text-lg"
          >
            {createSale.isPending ? 'Registrando...' : 'Finalizar Venda'}
          </button>

          {createSale.isError && (
            <p className="text-red-400 text-xs text-center">{(createSale.error as Error).message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
