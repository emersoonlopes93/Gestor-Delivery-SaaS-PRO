import { StorefrontProduct } from '../types';
import { StorefrontButton } from './StorefrontButton';
import { StorefrontBadge } from './StorefrontBadge';
import { cn } from '../cn';

export interface ProductCardProps {
  product: StorefrontProduct;
  onClick?: (product: StorefrontProduct) => void;
  currencyFormatter?: (value: number) => string;
  showDescription?: boolean;
  showBadges?: boolean;
  imageMode?: 'cover' | 'contain' | 'hidden';
}

export function ProductGridCard({
  product,
  onClick,
  currencyFormatter = (v) => `R$ ${v.toFixed(2)}`,
  showDescription = true,
  showBadges = true,
  imageMode = 'cover'
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
          <img 
            src={product.imageUrl!} 
            alt={product.name}
            className={cn(
              'w-full h-full transition-transform group-hover:scale-105',
              imageMode === 'cover' ? 'object-cover' : 'object-contain'
            )}
          />
        </div>
      ) : (
        <div className="aspect-video w-full flex items-center justify-center bg-[var(--storefront-muted)]">
          <span className="text-[var(--storefront-muted-foreground)] text-xs font-medium">Sem imagem</span>
        </div>
      )}

      <div className="flex flex-col flex-1 p-4">
        <div className="flex flex-wrap gap-1 mb-2">
          {showBadges && product.badges?.map((badge, idx) => (
            <StorefrontBadge key={idx} variant="primary">{badge}</StorefrontBadge>
          ))}
          {!product.isAvailable && (
            <StorefrontBadge variant="secondary">Indisponível</StorefrontBadge>
          )}
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
