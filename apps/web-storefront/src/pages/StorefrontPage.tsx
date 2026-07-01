import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';
import type { StorefrontPayload, StorefrontProductPayload, StorefrontComboPayload, StorefrontCategoryPayload } from '@gestor/types';
import { useCartStore } from '../store/use-cart-store';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Award,
  Box,
  Gift,
  Heart,
  LogOut,
  Repeat2,
  ShoppingBag,
  Store,
  User,
  Wallet,
  AlertCircle,
  ClipboardList,
  Calendar,
  Coins,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ProductDetailsModal } from '../components/ProductDetailsModal';
import { CartDrawer } from '../components/CartDrawer';
import { ComboDetailsModal } from '../components/ComboDetailsModal';
import { ProductSkeleton, ComboSkeleton } from '../components/ProductSkeleton';
import { useCustomerStore } from '../store/useCustomerStore';
import { LoginModal } from '../components/LoginModal';
import { Link } from 'react-router-dom';
import {
  StorefrontButton,
  ProductRenderer,
  CategoryNavigation,
  StorefrontEmptyState,
  cn
} from '@gestor/storefront-ui';
import type { StorefrontProductLayout, StorefrontLayoutSettings } from '@gestor/theme';

type CustomerHomePayload = {
  profile: { name: string; totalOrders: number };
  intelligence: {
    daysSinceLastOrder: number | null;
    favoriteProducts: Array<{ id: string; name: string; orders: number; quantity: number }>;
    purchaseHours: Array<{ hour: number; orders: number }>;
    segments: string[];
  } | null;
  loyalty: { balance: number; badges: string[] };
  wallet: { cashbackBalance: number; promotionalCredits: number };
  coupons: Array<{ id: string; code: string; type: string; value: number; expiresAt?: string | null }>;
  orders: Array<{ id: string; orderNumber: string; total: number; status: string; createdAt: string }>;
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function StorefrontHero({ banner, name }: { banner?: string | null; name: string }) {
  if (!banner) return null;

  return (
    <section className="mb-6 rounded-[1.75rem] overflow-hidden border border-[var(--storefront-border)] bg-[var(--storefront-card)] shadow-sm">
      <div className="relative aspect-[16/6] min-h-40 max-h-64 bg-[var(--storefront-muted)]">
        <img
          src={banner}
          alt={`Banner da loja ${name}`}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-md px-3 py-1 text-[11px] font-bold text-white border border-white/20">
              Banner da vitrine
            </div>
            <p className="mt-2 text-sm text-white/90 max-w-md">
              Imagem opcional exibida no topo da loja. O fundo global continua separado.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function isPizzaCategory(category: StorefrontCategoryPayload) {
  return category.templateType === 'pizza';
}

export function StorefrontPage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [searchParams] = useSearchParams();
  const tableIdParam = searchParams.get('tableId');

  const setTenantId = useCartStore(s => s.setTenantId);
  const setCartTenantSlug = useCartStore(s => s.setTenantSlug);
  const setTableId = useCartStore(s => s.setTableId);
  const cartSubtotal = useCartStore(s => s.subtotal);
  const cartItemsCount = useCartStore(s => s.items.length);

  const [selectedProduct, setSelectedProduct] = useState<StorefrontProductPayload | null>(null);
  const [selectedProductCategory, setSelectedProductCategory] = useState<StorefrontCategoryPayload | null>(null);
  const [selectedCombo, setSelectedCombo] = useState<StorefrontComboPayload | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const { customer, logout, isLoggedIn, tenantSlug: customerTenantSlug, setTenantSlug } = useCustomerStore();

  useEffect(() => {
    if (!tenantSlug) return;
    setTenantSlug(tenantSlug);
    setCartTenantSlug(tenantSlug);
  }, [tenantSlug, setTenantSlug, setCartTenantSlug]);

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

  const { data: customerHome } = useQuery({
    queryKey: ['customer-profile', tenantSlug],
    queryFn: async () => (await api.get<CustomerHomePayload>('/public/customer-profile')).data,
    enabled: isLoggedIn && customerTenantSlug === tenantSlug,
    staleTime: 60_000,
  });
  const displayCustomerName =
    customerHome?.profile?.name?.trim() && customerHome.profile.name !== 'Cliente Novo'
      ? customerHome.profile.name
      : customer?.name?.trim() && customer.name !== 'Cliente Novo'
        ? customer.name
        : '';

  const productCategoryIndex = useMemo(() => {
    const index = new Map<string, StorefrontCategoryPayload>();

    for (const category of data?.categories ?? []) {
      for (const product of category.products) {
        const current = index.get(product.id);
        if (!current) {
          index.set(product.id, category);
          continue;
        }

        if (current.isVirtual && !category.isVirtual) {
          index.set(product.id, category);
          continue;
        }

        if (!isPizzaCategory(current) && isPizzaCategory(category)) {
          index.set(product.id, category);
        }
      }
    }

    return index;
  }, [data?.categories]);

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

  const layoutSettings = (customization?.layout || {}) as Partial<StorefrontLayoutSettings>;

  // Use real settings from backend, with local override for testing in DEV
  // Backend now guarantees normalization, but we add a safety layer here too.
  const effectiveProductLayout = (import.meta.env.DEV && productLayout !== 'grid')
    ? productLayout
    : (layoutSettings.productLayout || 'grid') as StorefrontProductLayout;

  return (
    <div
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
              <Link
                to={`/${tenantSlug}/profile`}
                className="p-2 text-[var(--storefront-muted-foreground)] hover:text-[var(--storefront-primary)] transition-colors"
                title="Meu Perfil"
              >
                <User className="w-6 h-6" />
              </Link>
              <div className="text-right hidden sm:block">
                <p className="text-xs text-[var(--storefront-muted-foreground)]">Olá,</p>
                <p className="text-sm font-bold text-[var(--storefront-foreground)]">{displayCustomerName || 'Cliente'}</p>
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

      <StorefrontHero banner={tenant.banner} name={tenant.name} />



      {!data.tenant.isOpen ? (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {data.tenant.statusMessage || 'Loja fechada no momento.'}
        </div>
      ) : null}

      {customerHome ? (
        <section className="mb-6 rounded-[var(--storefront-radius)] border border-[var(--storefront-border)] bg-[var(--storefront-card)] p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[var(--storefront-muted-foreground)]">
                Feito para voce
              </p>
              <h2 className="mt-1 text-lg font-black text-[var(--storefront-foreground)]">
                {customerHome.intelligence?.favoriteProducts[0]
                  ? `Que tal repetir ${customerHome.intelligence.favoriteProducts[0].name}?`
                  : `Bem-vindo de volta, ${customerHome.profile.name}`}
              </h2>
              <p className="mt-1 text-sm text-[var(--storefront-muted-foreground)]">
                {customerHome.intelligence?.daysSinceLastOrder == null
                  ? tenant.loyalty?.enabled
                    ? 'Seu historico, pontos e carteira ficam sempre no perfil.'
                    : 'Seu historico e carteira ficam sempre no perfil.'
                  : `Ultimo pedido ha ${customerHome.intelligence.daysSinceLastOrder} dia(s).`}
              </p>
            </div>
            <Link
              to={`/${tenantSlug}/orders`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--storefront-primary)] px-4 text-sm font-black text-[var(--storefront-primary-foreground)]"
            >
              <Repeat2 className="h-4 w-4" />
              Comprar novamente
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tenant.cashback?.enabled ? (
              <SmartMetric icon={Wallet} label="Cashback" value={money(customerHome.wallet.cashbackBalance)} />
            ) : null}
            {tenant.loyalty?.enabled ? (
              <SmartMetric icon={Award} label="Pontos" value={customerHome.loyalty.balance} />
            ) : null}
            <SmartMetric icon={Gift} label="Cupons" value={customerHome.coupons.length} />
            <SmartMetric icon={Heart} label="Favoritos" value={customerHome.intelligence?.favoriteProducts.length ?? 0} />
          </div>
        </section>
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
        className="-mx-4 mb-6"
      />

      {/* Banners */}
      <div className="flex flex-col gap-3 mb-8">
        {data.tenant.scheduling?.enabled && (
          <div className="bg-blue-50 text-blue-800 px-4 py-3 rounded-[var(--storefront-radius)] flex items-center gap-3 border border-blue-100">
            <Calendar className="w-5 h-5 flex-shrink-0 text-blue-500" />
            <div className="flex-1">
              <p className="font-bold text-sm">Agendamento Disponível</p>
              <p className="text-xs opacity-90 mt-0.5">Faça seu pedido agora e escolha o melhor horário para receber.</p>
            </div>
          </div>
        )}

        {data.tenant.cashback?.enabled && data.tenant.cashback.percent > 0 && (
          <div className="bg-green-50 text-green-800 px-4 py-3 rounded-[var(--storefront-radius)] flex items-center gap-3 border border-green-100">
            <Coins className="w-5 h-5 flex-shrink-0 text-green-500" />
            <div className="flex-1">
              <p className="font-bold text-sm">Ganhe {data.tenant.cashback.percent}% de Cashback</p>
              <p className="text-xs opacity-90 mt-0.5">Parte do valor das suas compras volta para você usar depois.</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-12 mt-4">
        {/* Combos Section */}
        {combos.length > 0 && (
          <section id="combos">
            <h2
              className="text-lg font-black uppercase tracking-wider text-[var(--storefront-primary-foreground)] bg-[var(--storefront-primary)] mb-6 px-4 py-3 rounded-xl flex items-center shadow-sm"
            >
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
        {categories.map((category) => {
          const rawBg = category.templateConfig?.backgroundColor;
          const bgStyle = typeof rawBg === 'string' ? { backgroundColor: rawBg } : undefined;

          return (
            <section key={category.id} id={category.slug} style={bgStyle} className={cn(bgStyle && "p-4 sm:p-6 rounded-2xl", "scroll-m-20")}>
              <h2
                className="text-lg font-black uppercase tracking-wider text-[var(--storefront-primary-foreground)] bg-[var(--storefront-primary)] mb-6 px-4 py-3 rounded-xl flex items-center shadow-sm"
              >
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
                      compareAtPrice: product.compareAtPrice,
                      isAvailable: product.isAvailable,
                      badges: product.badges,
                    }}
                    layout={effectiveProductLayout}
                    imageMode={layoutSettings.productImageMode}
                    showDescription={layoutSettings.showProductDescription}
                    showBadges={layoutSettings.showBadges}
                    onSelectProduct={() => {
                      setSelectedProduct(product);
                      setSelectedProductCategory(productCategoryIndex.get(product.id) ?? category ?? null);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}

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
          category={selectedProductCategory}
          pizzaFlavorCandidates={selectedProductCategory && isPizzaCategory(selectedProductCategory) ? selectedProductCategory.products : []}
          isStoreClosed={!data.tenant.isOpen}
          onClose={() => {
            setSelectedProduct(null);
            setSelectedProductCategory(null);
          }}
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
          minimumOrderValue={data?.tenant.minimumOrderValue}
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
    </div>
  );
}

function SmartMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-[var(--storefront-border)] bg-[var(--storefront-muted)] p-3">
      <Icon className="h-4 w-4 text-[var(--storefront-primary)]" />
      <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-[var(--storefront-muted-foreground)]">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-[var(--storefront-foreground)]">{value}</p>
    </div>
  );
}
