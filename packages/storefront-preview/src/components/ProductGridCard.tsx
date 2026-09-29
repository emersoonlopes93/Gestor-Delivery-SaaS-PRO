import { StorefrontProduct } from '../types';
import { StorefrontButton } from './StorefrontButton';
import { ImageOff } from 'lucide-react';
import { StorefrontBadge } from './StorefrontBadge';
import { cn } from '../cn';
import { ResilientProductImage } from '../product-image';

export interface ProductCardProps {
  product: StorefrontProduct;
  onClick?: (product: StorefrontProduct) => void;
  currencyFormatter?: (value: number) => string;
  showDescription?: boolean;
  showBadges?: boolean;
  imageMode?: 'cover' | 'contain' | 'hidden';
  fallbackImageUrl?: string;
}

export function ProductGridCard({
  product,
  onClick,
  currencyFormatter = (v) => `R$ ${v.toFixed(2)}`,
  showDescription = true,
  showBadges = true,
  imageMode = 'cover',
  fallbackImageUrl,
}: ProductCardProps) {
  const hasImage = !!product.imageUrl && imageMode !== 'hidden';

  return (
    <div 
      onClick={() => onClick?.(product)}
      className={cn(
        'group flex flex-col bg-[var(--storefront-card)] border border-[var(--storefront-border)] rounded-[var(--storefront-radius)] overflow-hidden transition-all hover:border-[var(--storefront-primary)] cursor-pointer',
        !product.isAvailable && 'opacity-60 grayscale'
      )}
    >
      {hasImage ? (
        <div className="aspect-video w-full overflow-hidden bg-[var(--storefront-muted)]">
          <ResilientProductImage
            src={product.imageUrl!} 
            fallbackSrc={fallbackImageUrl ?? product.imageUrl!}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className={cn(
              'w-full h-full transition-transform group-hover:scale-105',
              imageMode === 'cover' ? 'object-cover' : 'object-contain'
            )}
          />
        </div>
      ) : imageMode !== 'hidden' ? (
        <div className="aspect-video w-full flex items-center justify-center bg-[var(--storefront-muted)]">
          <ImageOff className="w-8 h-8 text-[var(--storefront-muted-foreground)] opacity-50" />
        </div>
      ) : null}

      <div className="flex flex-col flex-1 p-4">
        <div className="flex flex-wrap gap-1 mb-2">
          {showBadges && product.badges?.map((badge, idx) => {
            // map variant to StorefrontBadge variant if needed
            let badgeVariant: 'primary' | 'secondary' | 'outline' = 'primary';
            if (badge.variant === 'danger') badgeVariant = 'secondary';
            if (badge.variant === 'neutral') badgeVariant = 'outline';
            return <StorefrontBadge key={idx} variant={badgeVariant}>{badge.label}</StorefrontBadge>;
          })}
        </div>

        <h3 className="font-bold text-[var(--storefront-foreground)] line-clamp-2 mb-1 group-hover:text-[var(--storefront-primary)] transition-colors">
          {product.name}
        </h3>

        {showDescription && product.description && (
          <p className="text-sm text-[var(--storefront-muted-foreground)] line-clamp-2 mb-4 flex-1">
            {product.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex flex-col">
            {product.pricePrefix ? <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--storefront-muted-foreground)]">{product.pricePrefix}</span> : null}
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="text-xs text-[var(--storefront-muted-foreground)] line-through">
                {currencyFormatter(product.compareAtPrice)}
              </span>
            )}
            <span className="font-black text-[var(--storefront-foreground)]">
              {currencyFormatter(product.price)}
            </span>
          </div>

          <StorefrontButton size="sm" disabled={!product.isAvailable}>
            Adicionar
          </StorefrontButton>
        </div>
      </div>
    </div>
  );
}
