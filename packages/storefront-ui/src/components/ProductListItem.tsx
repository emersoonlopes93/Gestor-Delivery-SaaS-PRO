import { ProductCardProps } from './ProductGridCard';
import { StorefrontBadge } from './StorefrontBadge';
import { ImageOff } from 'lucide-react';
import { cn } from '../cn';
import { ResilientProductImage } from '../product-image';

export function ProductListItem({
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
        'group flex bg-[var(--storefront-card)] border border-[var(--storefront-border)] rounded-[var(--storefront-radius)] overflow-hidden transition-all hover:border-[var(--storefront-primary)] cursor-pointer p-3 gap-4',
        !product.isAvailable && 'opacity-60 grayscale'
      )}
    >
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex flex-wrap gap-1 mb-1">
          {showBadges && product.badges?.map((badge, idx) => {
            let badgeVariant: 'primary' | 'secondary' | 'outline' = 'primary';
            if (badge.variant === 'danger') badgeVariant = 'secondary';
            if (badge.variant === 'neutral') badgeVariant = 'outline';
            return <StorefrontBadge key={idx} variant={badgeVariant}>{badge.label}</StorefrontBadge>;
          })}
        </div>

        <h3 className="font-bold text-[var(--storefront-foreground)] truncate group-hover:text-[var(--storefront-primary)] transition-colors">
          {product.name}
        </h3>

        {showDescription && product.description && (
          <p className="text-xs text-[var(--storefront-muted-foreground)] line-clamp-2 mt-1">
            {product.description}
          </p>
        )}

        <div className="mt-2 flex items-center gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-black text-[var(--storefront-foreground)]">
              {currencyFormatter(product.price)}
            </span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="text-[10px] text-[var(--storefront-muted-foreground)] line-through">
                {currencyFormatter(product.compareAtPrice)}
              </span>
            )}
          </div>
          {!product.isAvailable && (
            <StorefrontBadge variant="secondary">Indisponível</StorefrontBadge>
          )}
        </div>
      </div>

      {hasImage ? (
        <div className="w-24 h-24 flex-shrink-0 rounded-[var(--storefront-radius)] overflow-hidden bg-[var(--storefront-muted)]">
          <ResilientProductImage
            src={product.imageUrl!} 
            fallbackSrc={fallbackImageUrl ?? product.imageUrl!}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className={cn(
              'w-full h-full',
              imageMode === 'cover' ? 'object-cover' : 'object-contain'
            )}
          />
        </div>
      ) : imageMode !== 'hidden' ? (
        <div className="w-24 h-24 flex-shrink-0 rounded-[var(--storefront-radius)] overflow-hidden bg-[var(--storefront-muted)] flex items-center justify-center">
          <ImageOff className="w-8 h-8 text-[var(--storefront-muted-foreground)] opacity-50" />
        </div>
      ) : null}
    </div>
  );
}
