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
import { 
  StorefrontThemeProvider, 
  StorefrontButton, 
  ProductRenderer, 
  CategoryNavigation, 
  StorefrontEmptyState,
  cn
} from '@gestor/storefront-ui';
import { useStorefrontThemeStore } from '../stores/theme.store';
import type { StorefrontProductLayout, StorefrontThemeSettings, StorefrontLayoutSettings } from '@gestor/theme';

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

  const storefrontTheme = useStorefrontThemeStore(s => s.theme);

  // Demo state for layout testing
  const [productLayout, setProductLayout] = useState<StorefrontProductLayout>('grid');

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

  const { tenant, categories, combos, customization } = data;

  const themeSettings = (customization?.theme || {}) as Partial<StorefrontThemeSettings>;
  const layoutSettings = (customization?.layout || {}) as Partial<StorefrontLayoutSettings>;

  // Use real settings from backend, with local override for testing in DEV
  // Backend now guarantees normalization, but we add a safety layer here too.
  const effectiveProductLayout = (import.meta.env.DEV && productLayout !== 'grid') 
    ? productLayout 
    : (layoutSettings.productLayout || 'grid') as StorefrontProductLayout;

  const effectiveTheme = {
    ...themeSettings,
    colorMode: (storefrontTheme === 'system' 
      ? (themeSettings.colorMode || 'light') 
      : storefrontTheme) as 'light' | 'dark',
  };

  return (
    <StorefrontThemeProvider 
      settings={effectiveTheme}
      className="px-4 py-6"
    >
      {/* Store Header */}
      <header className="mb-8 flex items-center gap-4">
        {tenant.logo ? (
          <img src={tenant.logo} alt={tenant.name} className="w-16 h-16 rounded-[var(--storefront-radius)] object-cover bg-[var(--storefront-card)] shadow-sm border border-[var(--storefront-border)]" />
        ) : (
          <div className="w-16 h-16 rounded-[var(--storefront-radius)] bg-[var(--storefront-muted)] flex items-center justify-center text-[var(--storefront-primary)] font-bold text-xl border border-[var(--storefront-border)]">
            {tenant.name.substring(0, 1)}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black text-[var(--storefront-foreground)] leading-tight">{tenant.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${data.tenant.isOpen ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-[var(--storefront-muted-foreground)] font-medium">
              {data.tenant.statusMessage || (data.tenant.isOpen ? 'Aberto agora' : 'Fechado no momento')}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
               <Link 
                to={`/${tenantSlug}/orders`}
                className="p-2 text-[var(--storefront-muted-foreground)] hover:text-[var(--storefront-primary)] transition-colors"
                title="Meus Pedidos"
              >
                <ClipboardList className="w-6 h-6" />
              </Link>
              <div className="text-right hidden sm:block">
                <p className="text-xs text-[var(--storefront-muted-foreground)]">Olá,</p>
                <p className="text-sm font-bold text-[var(--storefront-foreground)]">{customer?.name}</p>
              </div>
              <button 
                onClick={logout}
                className="p-2 text-[var(--storefront-muted-foreground)] hover:text-red-500 transition-colors"
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

      {/* Demo Layout Switcher (DEV ONLY) */}
      {import.meta.env.DEV && (
        <div className="mb-6 p-4 bg-[var(--storefront-muted)] rounded-[var(--storefront-radius)] border border-[var(--storefront-border)]">
          <p className="text-xs font-bold text-[var(--storefront-muted-foreground)] uppercase tracking-widest mb-3">Demo (DEV): Escolha o Layout</p>
          <div className="flex flex-wrap gap-2">
            {(['grid', 'list', 'compact', 'square', 'premium-card'] as const).map((layout) => (
              <button
                key={layout}
                onClick={() => setProductLayout(layout)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight transition-all',
                  productLayout === layout 
                    ? 'bg-[var(--storefront-primary)] text-[var(--storefront-primary-foreground)]' 
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                )}
              >
                {layout}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Categories Navigation */}
      <CategoryNavigation 
        categories={categories}
        layout={layoutSettings.categoryLayout || 'tabs'}
        onCategoryClick={(slug) => {
          const el = document.getElementById(slug);
          if (el) {
            const offset = 80; // Adjust for sticky header
            const bodyRect = document.body.getBoundingClientRect().top;
            const elementRect = el.getBoundingClientRect().top;
            const elementPosition = elementRect - bodyRect;
            const offsetPosition = elementPosition - offset;

            window.scrollTo({
              top: offsetPosition,
              behavior: 'smooth'
            });
          }
        }}
        className="-mx-4 mb-8"
      />

      <div className="space-y-12 mt-4">
        {/* Combos Section */}
        {combos.length > 0 && (
          <section id="combos">
            <h2 className="text-lg font-bold text-[var(--storefront-foreground)] mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-[var(--storefront-primary)] rounded-full" />
              COMBOS ESPECIAIS
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {combos.map((combo) => (
                <button
                  key={combo.id}
                  onClick={() => setSelectedCombo(combo)}
                  disabled={!combo.isAvailable}
                  className={cn(
                    'flex bg-[var(--storefront-card)] rounded-[var(--storefront-radius)] p-3 border border-[var(--storefront-border)] transition-all text-left group',
                    combo.isAvailable ? 'hover:border-[var(--storefront-primary)]' : 'opacity-50 grayscale cursor-not-allowed'
                  )}
                >
                  <div className="flex-1 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Box className="w-3 h-3 text-[var(--storefront-primary)]" />
                      <h3 className="font-bold text-[var(--storefront-foreground)] group-hover:text-[var(--storefront-primary)] transition-colors uppercase text-sm tracking-wide">
                        {combo.name}
                      </h3>
                      {!combo.isAvailable ? (
                        <span className="ml-auto text-[10px] font-black text-red-600 uppercase">Indisponível</span>
                      ) : null}
                    </div>
                    <p className="text-xs text-[var(--storefront-muted-foreground)] line-clamp-2 leading-relaxed italic">
                      {combo.description || 'Combo completo para você.'}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm font-black text-[var(--storefront-foreground)]">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(combo.basePrice)}
                      </span>
                    </div>
                  </div>
                  {combo.image && (
                    <img 
                      src={combo.image} 
                      alt={combo.name} 
                      className="w-24 h-24 rounded-[var(--storefront-radius)] object-cover"
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
            <h2 className="text-lg font-bold text-[var(--storefront-foreground)] mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-[var(--storefront-primary)] rounded-full" />
              {category.name}
            </h2>
            
            <div className={cn(
              'grid gap-3 sm:gap-4',
              effectiveProductLayout === 'grid' && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
              effectiveProductLayout === 'square' && 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
              effectiveProductLayout === 'compact' && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
              effectiveProductLayout === 'list' && 'grid-cols-1',
              effectiveProductLayout === 'premium-card' && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            )}>
              {category.products.map((product) => (
                <ProductRenderer
                  key={product.id}
                  product={{
                    id: product.id,
                    name: product.name,
                    description: product.shortDescription,
                    imageUrl: product.image,
                    price: product.basePrice,
                    isAvailable: product.isAvailable,
                  }}
                  layout={effectiveProductLayout}
                  imageMode={layoutSettings.productImageMode}
                  showDescription={layoutSettings.showProductDescription}
                  showBadges={layoutSettings.showBadges}
                  onSelectProduct={() => setSelectedProduct(product)}
                />
              ))}
            </div>
          </section>
        ))}

        {combos.length === 0 && categories.length === 0 && (
          <StorefrontEmptyState 
            title="Nenhum item disponível"
            description="Nenhum item disponível para este canal no momento."
            icon={<ShoppingBag className="w-12 h-12" />}
          />
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
