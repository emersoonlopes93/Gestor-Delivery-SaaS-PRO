import { ProductCardProps } from './ProductGridCard';
import { StorefrontBadge } from './StorefrontBadge';
import { ImageOff } from 'lucide-react';
import { cn } from '../cn';
import { ResilientProductImage } from '../product-image';

export function ProductSquareCard({
  product,
  onClick,
  currencyFormatter = (v) => `R$ ${v.toFixed(2)}`,
  showBadges = true,
  imageMode = 'cover',
  fallbackImageUrl,
}: ProductCardProps) {
  const hasImage = !!product.imageUrl && imageMode !== 'hidden';

  return (
    <div 
      onClick={() => onClick?.(product)}
      className={cn(
        'group relative aspect-square bg-[var(--storefront-card)] border border-[var(--storefront-border)] rounded-[var(--storefront-radius)] overflow-hidden transition-all hover:border-[var(--storefront-primary)] cursor-pointer',
        !product.isAvailable && 'opacity-60 grayscale'
      )}
    >
      {hasImage ? (
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
      ) : imageMode !== 'hidden' ? (
        <div className="w-full h-full flex items-center justify-center bg-[var(--storefront-muted)] relative z-0">
          <ImageOff className="w-10 h-10 text-[var(--storefront-muted-foreground)] opacity-50" />
        </div>
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3">
        <div className="flex flex-wrap gap-1 mb-1">
          {showBadges && product.badges?.map((badge, idx) => {
            let badgeVariant: 'primary' | 'secondary' | 'outline' = 'primary';
            if (badge.variant === 'danger') badgeVariant = 'secondary';
            if (badge.variant === 'neutral') badgeVariant = 'outline';
            return <StorefrontBadge key={idx} variant={badgeVariant}>{badge.label}</StorefrontBadge>;
          })}
        </div>

        <h3 className="font-bold text-white text-sm line-clamp-2 leading-tight">
          {product.name}
        </h3>
        <span className="font-black text-white text-base">
          {currencyFormatter(product.price)}
        </span>
      </div>
      
      {!product.isAvailable && (
        <div className="absolute top-2 right-2">
          <StorefrontBadge variant="secondary">Indisponível</StorefrontBadge>
        </div>
      )}
    </div>
  );
}
