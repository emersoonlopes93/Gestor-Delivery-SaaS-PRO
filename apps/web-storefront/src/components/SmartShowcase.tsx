import type { StorefrontProductPayload, StorefrontShowcasePayload } from '@gestor/types';
import type { StorefrontImageMode, StorefrontProductLayout } from '@gestor/theme';
import { ProductRenderer } from '@gestor/storefront-ui';

type SmartShowcaseProps = {
  showcase?: StorefrontShowcasePayload;
  productLayout: StorefrontProductLayout;
  imageMode?: StorefrontImageMode;
  showDescription?: boolean;
  showBadges?: boolean;
  onSelectProduct: (product: StorefrontProductPayload) => void;
};

export function SmartShowcase({
  showcase,
  productLayout,
  imageMode,
  showDescription,
  showBadges,
  onSelectProduct,
}: SmartShowcaseProps) {
  if (!showcase?.products.length) return null;

  return (
    <section className="mb-7" aria-labelledby="smart-showcase-title">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--storefront-primary)]">
            Seleção da casa
          </p>
          <h2 id="smart-showcase-title" className="mt-1 text-xl font-black text-[var(--storefront-foreground)]">
            {showcase.title}
          </h2>
        </div>
        <span className="hidden text-xs font-medium text-[var(--storefront-muted-foreground)] sm:block">
          Arraste para explorar
        </span>
      </div>

      <div
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 scrollbar-hide sm:gap-4"
        role="list"
        aria-label={showcase.title}
        tabIndex={0}
      >
        {showcase.products.map((product) => (
          <div key={product.id} className="w-[78vw] max-w-80 shrink-0 snap-start" role="listitem">
            <ProductRenderer
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
              layout={productLayout}
              imageMode={imageMode}
              showDescription={showDescription}
              showBadges={showBadges}
              onSelectProduct={() => onSelectProduct(product)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
