import { useState } from 'react';
import type { StorefrontPayload, StorefrontProductPayload } from '@gestor/types';
import {
  getDefaultStorefrontLayoutSettings,
  type StorefrontLayoutSettings,
  type StorefrontThemeSettings,
} from '@gestor/theme';
import {
  CategoryNavigation,
  ProductRenderer,
  SmartShowcase,
  StorefrontShell,
  toStorefrontProduct,
} from '@gestor/storefront-preview';

interface StorefrontPreviewProps {
  payload: StorefrontPayload;
}

function uniqueProducts(products: StorefrontProductPayload[]): StorefrontProductPayload[] {
  return [...new Map(products.map((product) => [product.id, product])).values()];
}

export function StorefrontPreview({ payload }: StorefrontPreviewProps) {
  const [activeCategoryId, setActiveCategoryId] = useState(payload.categories[0]?.id);
  const theme = (payload.customization?.theme ?? {}) as Partial<StorefrontThemeSettings>;
  const layout = (payload.customization?.layout ?? getDefaultStorefrontLayoutSettings()) as StorefrontLayoutSettings;
  const categories = payload.categories.filter((category) => category.products.length > 0);

  const scrollToCategory = (slug: string) => {
    const category = categories.find((item) => item.slug === slug);
    if (!category) return;
    setActiveCategoryId(category.id);
    document.getElementById(`admin-preview-category-${category.id}`)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <StorefrontShell settings={theme} className="min-h-full text-left">
      {layout.heroEnabled && payload.tenant.banner ? (
        <div className="px-3 pt-3">
          <div className="aspect-[16/6] min-h-24 overflow-hidden rounded-[var(--storefront-radius)] border border-[var(--storefront-border)]">
            <img src={payload.tenant.banner} alt="Banner da vitrine" className="h-full w-full object-cover" />
          </div>
        </div>
      ) : null}

      <header className="flex items-center gap-2.5 border-b border-[var(--storefront-border)] bg-[var(--storefront-card)]/80 p-3.5">
        {payload.tenant.logo ? (
          <img src={payload.tenant.logo} className="h-8 w-8 shrink-0 rounded-[var(--storefront-radius)] object-cover" alt="" />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--storefront-radius)] bg-[var(--storefront-primary)] text-xs font-black text-[var(--storefront-primary-foreground)]">
            {payload.tenant.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-bold">{payload.tenant.name}</div>
          <div className="mt-0.5 text-[7.5px] font-black uppercase tracking-widest text-[var(--storefront-muted-foreground)]">
            {payload.tenant.statusMessage}
          </div>
        </div>
      </header>

      <CategoryNavigation
        categories={categories}
        activeCategoryId={activeCategoryId}
        layout={layout.categoryLayout}
        onCategoryClick={scrollToCategory}
        className="top-0"
      />

      <main className="space-y-5 p-3">
        {payload.showcase ? (
          <SmartShowcase
            title={payload.showcase.title}
            products={uniqueProducts(payload.showcase.products).map(toStorefrontProduct)}
            productLayout={layout.productLayout}
            imageMode={layout.productImageMode}
            showDescription={layout.showProductDescription}
            showBadges={layout.showBadges}
            businessSegment={payload.tenant.businessSegment}
            compact
          />
        ) : null}

        {categories.map((category) => (
          <section key={category.id} id={`admin-preview-category-${category.id}`} className="space-y-2.5">
            <h3 className="rounded bg-[var(--storefront-primary)] px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--storefront-primary-foreground)]">
              {category.name}
            </h3>
            <div className={layout.productLayout === 'grid' || layout.productLayout === 'square' ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5'}>
              {category.products.map((product) => (
                <ProductRenderer
                  key={product.id}
                  product={toStorefrontProduct(product)}
                  layout={layout.productLayout}
                  imageMode={layout.productImageMode}
                  showDescription={layout.showProductDescription}
                  showBadges={layout.showBadges}
                  businessSegment={payload.tenant.businessSegment}
                />
              ))}
            </div>
          </section>
        ))}

        {categories.length === 0 ? (
          <p className="rounded border border-dashed border-[var(--storefront-border)] p-4 text-center text-xs text-[var(--storefront-muted-foreground)]">
            Nenhum produto elegível para este canal.
          </p>
        ) : null}
      </main>
    </StorefrontShell>
  );
}
