import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import type { StorefrontPayload, StorefrontProductPayload, StorefrontComboPayload } from '@gestor/types';
import { useCartStore } from '../store/use-cart-store';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Store, ShoppingBag, Box, AlertCircle } from 'lucide-react';
import { ProductDetailsModal } from '../components/ProductDetailsModal';
import { CartDrawer } from '../components/CartDrawer';
import { ComboDetailsModal } from '../components/ComboDetailsModal';
import { ProductSkeleton, ComboSkeleton } from '../components/ProductSkeleton';
import { useCustomerStore } from '../store/useCustomerStore';
import { LoginModal } from '../components/LoginModal';
import { User, LogOut, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StorefrontThemeProvider, StorefrontButton } from '@gestor/storefront-ui';
import { useStorefrontThemeStore } from '../stores/theme.store';

export function StorefrontPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [searchParams] = useSearchParams();
  const tableIdParam = searchParams.get('tableId');
  
  const setTenantId = useCartStore(s => s.setTenantId);
  const setTableId = useCartStore(s => s.setTableId);
  const cartSubtotal = useCartStore(s => s.subtotal);
  const cartItemsCount = useCartStore(s => s.items.length);

  const [selectedProduct, setSelectedProduct] = useState<StorefrontProductPayload | null>(null);
  const [selectedCombo, setSelectedCombo] = useState<StorefrontComboPayload | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const { customer, logout, isLoggedIn } = useCustomerStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['storefront', tenantSlug],
    queryFn: async () => {
      const res = await api.get<StorefrontPayload>(
        `/public/storefront/${tenantSlug}`,
      );
      return res.data;
    },
    enabled: !!tenantSlug,
  });

  useEffect(() => {
    if (data?.tenant) {
      const { tenant } = data;
      setTenantId(tenant.id);
      if (tableIdParam) {
        setTableId(tableIdParam);
      }

      // Atualizar dinamicamente o título da aba/guia do navegador
      const suffix = tenant.description ? ` - ${tenant.description}` : ' | Cardápio Digital';
      document.title = `${tenant.name}${suffix}`.substring(0, 80); // Limita o tamanho para exibição otimizada na aba

      // Atualizar o favicon (ícone da aba) dinamicamente com a logo do Tenant
      if (tenant.logo) {
        let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = tenant.logo;
      }

      // Atualizar a meta description para SEO dinamicamente
      if (tenant.description) {
        let meta: HTMLMetaElement | null = document.querySelector("meta[name='description']");
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'description';
          document.getElementsByTagName('head')[0].appendChild(meta);
        }
        meta.content = tenant.description;
      }
    }
  }, [data, setTenantId, tableIdParam, setTableId]);

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        {/* Store Header Skeleton */}
        <div className="mb-8 flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg bg-gray-200 animate-pulse"></div>
          <div className="flex-1">
            <div className="h-8 bg-gray-200 rounded mb-2 w-48"></div>
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </div>
        </div>

        {/* Categories Navigation Skeleton */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-200 rounded-full w-24 animate-pulse"></div>
          ))}
        </div>

        {/* Combos Skeleton */}
        <div className="mb-8">
          <div className="h-6 bg-gray-200 rounded mb-4 w-40"></div>
          <ComboSkeleton count={2} />
        </div>

        {/* Categories Skeleton */}
        <div className="space-y-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-6 bg-gray-200 rounded mb-4 w-32"></div>
              <ProductSkeleton count={4} />
            </div>
          ))}
        </div>
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
  const storefrontTheme = useStorefrontThemeStore(s => s.theme);

  return (
    <StorefrontThemeProvider 
      settings={{ 
        primaryColor: tenant.primaryColor, 
        colorMode: storefrontTheme,
        borderRadius: 'lg'
      }}
      className="px-4 py-6"
    >
      {/* Store Header */}
      <header className="mb-8 flex items-center gap-4">
        {tenant.logo ? (
          <img src={tenant.logo} alt={tenant.name} className="w-16 h-16 rounded-lg object-cover bg-white shadow-sm border" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-[var(--storefront-muted)] flex items-center justify-center text-[var(--storefront-primary)] font-bold text-xl border">
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

        <div className="ml-auto flex items-center gap-2">
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
               <Link 
                to={`/${tenantSlug}/orders`}
                className="p-2 text-gray-500 hover:text-primary-600 transition-colors"
                title="Meus Pedidos"
              >
                <ClipboardList className="w-6 h-6" />
              </Link>
              <div className="text-right hidden sm:block">
                <p className="text-xs text-gray-400">Olá,</p>
                <p className="text-sm font-bold text-gray-800">{customer?.name}</p>
              </div>
              <button 
                onClick={logout}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <StorefrontButton 
              variant="outline"
              size="sm"
              onClick={() => setIsLoginOpen(true)}
              className="rounded-full"
            >
              <User className="w-4 h-4 mr-2" />
              Entrar
            </StorefrontButton>
          )}
        </div>
      </header>



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
            <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {combos.map((combo) => (
                <button
                  key={combo.id}
                  onClick={() => setSelectedCombo(combo)}
                  disabled={!combo.isAvailable}
                  className={`flex bg-orange-50/50 rounded-xl p-3 border border-orange-100/50 transition-all text-left group ${
                    combo.isAvailable ? 'hover:border-orange-200' : 'opacity-50 grayscale cursor-not-allowed'
                  }`}
                >
                  <div className="flex-1 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Box className="w-3 h-3 text-orange-500" />
                      <h3 className="font-bold text-gray-900 group-hover:text-orange-600 transition-colors uppercase text-sm tracking-wide">
                        {combo.name}
                      </h3>
                      {!combo.isAvailable ? (
                        <span className="ml-auto text-[10px] font-black text-red-600 uppercase">Indisponível</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed italic">
                      {combo.description || 'Combo completo para você.'}
                    </p>
                    <div className="mt-3 font-black text-orange-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(combo.basePrice)}
                    </div>
                  </div>
                  {combo.image && (
                    <img 
                      src={combo.image} 
                      alt={combo.name} 
                      className="w-24 h-24 rounded-lg object-cover"
                      loading="lazy"
                      decoding="async"
                    />
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
            
            <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {category.products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  disabled={!product.isAvailable}
                  className={`flex bg-white rounded-xl p-3 shadow-sm border border-gray-100 transition-all text-left group ${
                    product.isAvailable ? 'hover:border-primary-200' : 'opacity-50 grayscale cursor-not-allowed'
                  }`}
                >
                  <div className="flex-1 pr-3">
                    <h3 className="font-bold text-gray-900 group-hover:text-primary-600 transition-colors uppercase text-sm tracking-wide">
                      {product.name}
                    </h3>
                    {!product.isAvailable ? (
                      <div className="mt-1 text-[10px] font-black text-red-600 uppercase">Indisponível</div>
                    ) : null}
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {product.shortDescription || 'Sem descrição.'}
                    </p>
                    <div className="mt-3 font-black text-primary-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.basePrice)}
                    </div>
                  </div>
                  {product.image && (
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      className="w-24 h-24 rounded-lg object-cover"
                      loading="lazy"
                      decoding="async"
                    />
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
        <CartDrawer 
          onClose={() => setIsCartOpen(false)} 
          upsells={data?.upsells} 
        />
      )}

      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={() => setIsLoginOpen(false)} 
        tenantSlug={tenantSlug!} 
      />

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
    </StorefrontThemeProvider>
  );
}
