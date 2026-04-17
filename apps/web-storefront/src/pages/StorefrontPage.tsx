import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import type { StorefrontPayload, StorefrontProductPayload, StorefrontComboPayload } from '@gestor/types';
import { useCartStore } from '../store/use-cart-store';
import { useEffect, useState } from 'react';
import { Loader2, Store, ShoppingBag, Box, Truck, AlertCircle } from 'lucide-react';
import { ProductDetailsModal } from '../components/ProductDetailsModal';
import { CartDrawer } from '../components/CartDrawer';
import { ComboDetailsModal } from '../components/ComboDetailsModal';

export function StorefrontPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const setTenantId = useCartStore(s => s.setTenantId);
  const cartSubtotal = useCartStore(s => s.subtotal);
  const cartItemsCount = useCartStore(s => s.items.length);

  const [selectedProduct, setSelectedProduct] = useState<StorefrontProductPayload | null>(null);
  const [selectedCombo, setSelectedCombo] = useState<StorefrontComboPayload | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>('delivery');

  const { data, isLoading, error } = useQuery({
    queryKey: ['storefront', tenantSlug, fulfillmentType],
    queryFn: async () => {
      const res = await api.get<StorefrontPayload>(
        `/public/storefront/${tenantSlug}?fulfillmentType=${fulfillmentType}`,
      );
      return res.data;
    },
    enabled: !!tenantSlug,
  });

  useEffect(() => {
    if (data?.tenant.id) {
      setTenantId(data.tenant.id);
    }
  }, [data?.tenant.id, setTenantId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="mt-4 text-gray-500 font-medium">Carregando cardápio...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <Store className="w-16 h-16 text-gray-300 mb-4" />
        <h1 className="text-xl font-bold text-gray-800">Loja não encontrada</h1>
        <p className="mt-2 text-gray-500">Verifique o endereço e tente novamente.</p>
      </div>
    );
  }

  const { tenant, categories, combos } = data;

  return (
    <div className="px-4 py-6">
      {/* Store Header */}
      <header className="mb-8 flex items-center gap-4">
        {tenant.logo ? (
          <img src={tenant.logo} alt={tenant.name} className="w-16 h-16 rounded-lg object-cover bg-white shadow-sm border" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-xl border">
            {tenant.name.substring(0, 1)}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black text-gray-900 leading-tight">{tenant.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${data.tenant.isOpen ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-500 font-medium">
              {data.tenant.statusMessage || (data.tenant.isOpen ? 'Aberto agora' : 'Fechado no momento')}
            </span>
          </div>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <button
          onClick={() => setFulfillmentType('delivery')}
          className={`rounded-xl px-3 py-2.5 text-sm font-bold border transition-colors flex items-center justify-center gap-2 ${
            fulfillmentType === 'delivery'
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-700 border-gray-200 hover:border-primary-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          Entrega
        </button>
        <button
          onClick={() => setFulfillmentType('pickup')}
          className={`rounded-xl px-3 py-2.5 text-sm font-bold border transition-colors flex items-center justify-center gap-2 ${
            fulfillmentType === 'pickup'
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-gray-700 border-gray-200 hover:border-primary-200'
          }`}
        >
          <Store className="w-4 h-4" />
          Retirada
        </button>
      </div>

      {!data.tenant.isOpen ? (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {data.tenant.statusMessage || 'Loja fechada no momento.'}
        </div>
      ) : null}

      {/* Categories / Anchor Links (Simple) */}
      <nav className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide sticky top-0 bg-gray-50/80 backdrop-blur-md z-30 pt-2 -mx-4 px-4 overflow-y-hidden">
        {combos.length > 0 && (
          <a href="#combos" className="whitespace-nowrap px-4 py-2 bg-white border border-gray-100 rounded-full text-xs font-bold text-gray-600 hover:border-primary-200 uppercase tracking-widest">Combos</a>
        )}
        {categories.map(cat => (
          <a key={cat.id} href={`#${cat.slug}`} className="whitespace-nowrap px-4 py-2 bg-white border border-gray-100 rounded-full text-xs font-bold text-gray-600 hover:border-primary-200 uppercase tracking-widest">
            {cat.name}
          </a>
        ))}
      </nav>

      <div className="space-y-12 mt-4">
        {/* Combos Section */}
        {combos.length > 0 && (
          <section id="combos">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-orange-500 rounded-full" />
              COMBOS ESPECIAIS
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {combos.map((combo) => (
                <button
                  key={combo.id}
                  onClick={() => setSelectedCombo(combo)}
                  className="flex bg-orange-50/50 rounded-xl p-3 border border-orange-100/50 hover:border-orange-200 transition-all text-left group"
                >
                  <div className="flex-1 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Box className="w-3 h-3 text-orange-500" />
                      <h3 className="font-bold text-gray-900 group-hover:text-orange-600 transition-colors uppercase text-sm tracking-wide">
                        {combo.name}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed italic">
                      {combo.description || 'Combo completo para você.'}
                    </p>
                    <div className="mt-3 font-black text-orange-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(combo.basePrice)}
                    </div>
                  </div>
                  {combo.image && (
                    <img src={combo.image} alt={combo.name} className="w-24 h-24 rounded-lg object-cover" />
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Categories Sections */}
        {categories.map((category) => (
          <section key={category.id} id={category.slug}>
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-primary-500 rounded-full" />
              {category.name}
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {category.products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="flex bg-white rounded-xl p-3 shadow-sm border border-gray-100 hover:border-primary-200 transition-all text-left group"
                >
                  <div className="flex-1 pr-3">
                    <h3 className="font-bold text-gray-900 group-hover:text-primary-600 transition-colors uppercase text-sm tracking-wide">
                      {product.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {product.shortDescription || 'Sem descrição.'}
                    </p>
                    <div className="mt-3 font-black text-primary-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.basePrice)}
                    </div>
                  </div>
                  {product.image && (
                    <img src={product.image} alt={product.name} className="w-24 h-24 rounded-lg object-cover" />
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}

        {combos.length === 0 && categories.length === 0 && (
          <section className="bg-white border border-gray-200 rounded-xl p-6 text-center">
            <p className="text-sm text-gray-600 font-medium">
              Nenhum item disponível para este canal no momento.
            </p>
          </section>
        )}
      </div>

      {/* Modals & Drawer */}
      {selectedProduct && (
        <ProductDetailsModal 
          product={selectedProduct} 
          isStoreClosed={!data.tenant.isOpen}
          onClose={() => setSelectedProduct(null)} 
        />
      )}

      {/* selectedCombo Modal */}
      {selectedCombo && (
        <ComboDetailsModal 
          combo={selectedCombo}
          isStoreClosed={!data.tenant.isOpen}
          onClose={() => setSelectedCombo(null)}
        />
      )}

      {isCartOpen && (
        <CartDrawer onClose={() => setIsCartOpen(false)} />
      )}

      {/* Floating Cart Button */}
      {cartItemsCount > 0 && !isCartOpen && tenant.isOpen && (
        <div className="fixed bottom-6 left-0 right-0 px-4 pointer-events-none z-40">
          <button 
            onClick={() => setIsCartOpen(true)}
            className="w-full max-w-lg mx-auto h-14 bg-primary-600 text-white rounded-2xl shadow-xl shadow-primary-200 flex items-center justify-between px-6 pointer-events-auto active:scale-95 transition-transform animate-in fade-in slide-in-from-bottom-5 duration-300"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag className="w-6 h-6" />
                <span className="absolute -top-2 -right-2 bg-white text-primary-600 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                  {cartItemsCount}
                </span>
              </div>
              <span className="font-bold uppercase tracking-widest text-sm">Ver carrinho</span>
            </div>
            <span className="font-black text-lg">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cartSubtotal)}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
