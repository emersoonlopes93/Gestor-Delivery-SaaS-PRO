import { ProductCardProps } from './ProductGridCard';
import { StorefrontBadge } from './StorefrontBadge';
import { cn } from '../cn';

export function ProductCompactCard({
  product,
  onClick,
  currencyFormatter = (v) => `R$ ${v.toFixed(2)}`,
  showBadges = true,
  imageMode = 'cover'
}: ProductCardProps) {
  const hasImage = !!product.imageUrl && imageMode !== 'hidden';

  return (
    <div 
      onClick={() => onClick?.(product)}
      className={cn(
        'group flex items-center bg-[var(--storefront-card)] border border-[var(--storefront-border)] rounded-[var(--storefront-radius)] overflow-hidden transition-all hover:border-[var(--storefront-primary)] cursor-pointer p-2 gap-3',
        !product.isAvailable && 'opacity-60 grayscale'
      )}
    >
      {hasImage && (
        <div className="w-12 h-12 flex-shrink-0 rounded-[calc(var(--storefront-radius)-4px)] overflow-hidden bg-[var(--storefront-muted)]">
          <img 
            src={product.imageUrl!} 
            alt={product.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-sm text-[var(--storefront-foreground)] truncate group-hover:text-[var(--storefront-primary)] transition-colors leading-tight">
          {product.name}
        </h3>
        <span className="font-black text-sm text-[var(--storefront-foreground)]">
          {currencyFormatter(product.price)}
        </span>
      </div>

      <div className="flex flex-col items-end gap-1">
        {showBadges && product.badges?.[0] && (
          <StorefrontBadge variant={product.badges[0].variant === 'danger' ? 'secondary' : product.badges[0].variant === 'neutral' ? 'outline' : 'primary'}>
            {product.badges[0].label}
          </StorefrontBadge>
        )}
      </div>
    </div>
  );
}
