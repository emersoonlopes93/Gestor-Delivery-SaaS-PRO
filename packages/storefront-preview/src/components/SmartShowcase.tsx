import type { StorefrontImageMode, StorefrontProductLayout } from '@gestor/theme';
import type { StorefrontProduct } from '../types';
import type { ProductFallbackSegment } from '../product-image';
import { ProductRenderer } from './ProductRenderer';

interface SmartShowcaseProps {
  title: string;
  products: StorefrontProduct[];
  productLayout: StorefrontProductLayout;
  imageMode?: StorefrontImageMode;
  showDescription?: boolean;
  showBadges?: boolean;
  onSelectProduct?: (product: StorefrontProduct) => void;
  compact?: boolean;
  businessSegment?: ProductFallbackSegment | null;
}

export function SmartShowcase({
  title,
  products,
  productLayout,
  imageMode,
  showDescription,
  showBadges,
  onSelectProduct,
  compact = false,
  businessSegment,
}: SmartShowcaseProps) {
  if (products.length === 0) return null;

  return (
    <section className={compact ? 'mb-4' : 'mb-7'} aria-labelledby="smart-showcase-title">
      <div className={compact ? 'mb-2' : 'mb-3 flex items-end justify-between gap-4'}>
        <div>
          <p className={`${compact ? 'text-[7px]' : 'text-[10px]'} font-black uppercase tracking-[0.2em] text-[var(--storefront-primary)]`}>
            Seleção da casa
          </p>
          <h2 id="smart-showcase-title" className={`${compact ? 'mt-0.5 text-xs' : 'mt-1 text-xl'} font-black text-[var(--storefront-foreground)]`}>
            {title}
          </h2>
        </div>
        {!compact && (
          <span className="hidden text-xs font-medium text-[var(--storefront-muted-foreground)] sm:block">
            Arraste para explorar
          </span>
        )}
      </div>

      <div
        className={`flex snap-x snap-mandatory overflow-x-auto scrollbar-hide ${compact ? 'gap-2 pb-2' : '-mx-4 gap-3 px-4 pb-3 sm:gap-4'}`}
        role="list"
        aria-label={title}
        tabIndex={0}
      >
        {products.map((product) => (
          <div key={product.id} className={`${compact ? 'w-36' : 'w-[78vw] max-w-80'} shrink-0 snap-start`} role="listitem">
            <ProductRenderer
              product={product}
              layout={productLayout}
              imageMode={imageMode}
              showDescription={showDescription}
              showBadges={showBadges}
              onSelectProduct={onSelectProduct}
              businessSegment={businessSegment}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
