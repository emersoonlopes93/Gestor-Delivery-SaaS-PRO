import { X, Trash2, ShoppingBag, Plus, Minus, MapPin, Store, ChevronRight } from 'lucide-react';
import { useCartStore } from '../store/use-cart-store';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CartDrawerProps {
  onClose: () => void;
}

export function CartDrawer({ onClose }: CartDrawerProps) {
  const { items, subtotal, removeItem, updateQuantity } = useCartStore();
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery');
  const navigate = useNavigate();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  const handleCheckout = () => {
    onClose();
    navigate(`/${tenantSlug}/checkout`);
  };

  if (items.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
        <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
          <header className="p-6 border-b flex items-center justify-between">
            <h2 className="text-xl font-black text-gray-900 uppercase">Seu Carrinho</h2>
            <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-900 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </header>
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag className="w-10 h-10 text-gray-200" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Seu carrinho está vazio</h3>
            <p className="text-sm text-gray-500 mt-2">Adicione alguns produtos para começar seu pedido.</p>
            <button 
              onClick={onClose}
              className="mt-6 bg-primary-600 text-white font-bold px-8 py-3 rounded-2xl shadow-lg shadow-primary-100 hover:bg-primary-700 active:scale-95 transition-all"
            >
              Explorar cardápio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      {/* Backdrop Click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer */}
      <div className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        <header className="p-6 border-b flex items-center justify-between bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-black text-gray-900 uppercase">Seu Carrinho</h2>
            <p className="text-xs text-primary-600 font-bold tracking-widest mt-0.5">
              {items.length === 1 ? '1 ITEM' : `${items.length} ITENS`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Delivery/Pickup Switcher */}
        <div className="px-6 py-4 bg-gray-50 border-b">
          <div className="bg-white p-1 rounded-2xl flex border border-gray-100 shadow-inner">
            <button 
              onClick={() => setFulfillment('delivery')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all text-sm font-bold",
                fulfillment === 'delivery' ? "bg-primary-600 text-white shadow-md shadow-primary-100" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <MapPin className={cn("w-4 h-4", fulfillment === 'delivery' ? "text-white" : "text-gray-400")} />
              Entrega
            </button>
            <button 
              onClick={() => setFulfillment('pickup')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all text-sm font-bold",
                fulfillment === 'pickup' ? "bg-primary-600 text-white shadow-md shadow-primary-100" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <Store className={cn("w-4 h-4", fulfillment === 'pickup' ? "text-white" : "text-gray-400")} />
              Retirada
            </button>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {items.map((item) => (
            <div key={item.cartLineId} className="flex gap-4 group">
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-gray-900 text-sm uppercase leading-tight">{item.snapshot.productName}</h4>
                  <span className="font-black text-gray-900 text-sm ml-2 shrink-0">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.snapshot.lineSubtotal)}
                  </span>
                </div>
                
                {item.snapshot.extrasDescription && (
                  <p className="text-[10px] text-gray-400 mt-1 italic leading-relaxed">
                    {item.snapshot.extrasDescription}
                  </p>
                )}

                {item.notes && (
                  <div className="mt-2 bg-orange-50 border border-orange-100/50 rounded-lg p-2 text-[10px] text-orange-700 italic">
                    <span className="font-bold not-italic mr-1 uppercase">Obs:</span> {item.notes}
                  </div>
                )}

                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center bg-gray-100 rounded-xl p-0.5">
                    <button 
                      onClick={() => updateQuantity(item.cartLineId, item.quantity - 1)}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-white rounded-lg transition-all"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-gray-900">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.cartLineId, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-white rounded-lg transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => removeItem(item.cartLineId)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}</span>
            </div>
            {fulfillment === 'delivery' ? (
              <div className="flex justify-between text-sm text-gray-500">
                <span className="flex items-center gap-1.5 font-medium underline decoration-primary-200 underline-offset-4 decoration-2">
                  Taxa de entrega
                </span>
                <span className="font-bold text-green-600 italic">Grátis</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm text-gray-400 italic">
                <span>Retirada no local</span>
                <span>--</span>
              </div>
            )}
            <div className="pt-3 border-t flex justify-between">
              <span className="text-lg font-black text-gray-900 uppercase">Total</span>
              <span className="text-xl font-black text-primary-600 tracking-tight">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal)}
              </span>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            className="w-full h-14 bg-primary-600 text-white rounded-2xl shadow-xl shadow-primary-100 flex items-center justify-center gap-3 font-bold uppercase tracking-widest text-sm hover:bg-primary-700 active:scale-[0.98] transition-all"
          >
            Finalizar Pedido
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

