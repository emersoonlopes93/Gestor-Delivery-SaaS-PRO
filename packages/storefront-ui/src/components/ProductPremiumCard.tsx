import { ProductCardProps } from './ProductGridCard';
import { StorefrontButton } from './StorefrontButton';
import { StorefrontBadge } from './StorefrontBadge';
import { cn } from '../cn';

export function ProductPremiumCard({
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
        'group flex flex-col bg-[var(--storefront-card)] border border-[var(--storefront-border)] rounded-[var(--storefront-radius)] overflow-hidden transition-all hover:shadow-2xl hover:-translate-y-1 cursor-pointer ring-[var(--storefront-primary)] hover:ring-2',
        !product.isAvailable && 'opacity-60 grayscale'
      )}
    >
      {hasImage ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--storefront-muted)]">
          <img 
            src={product.imageUrl!} 
            alt={product.name}
            className={cn(
              'w-full h-full transition-transform duration-700 group-hover:scale-110',
              imageMode === 'cover' ? 'object-cover' : 'object-contain'
            )}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1">
            {showBadges && product.badges?.map((badge, idx) => {
              let badgeVariant: 'primary' | 'secondary' | 'outline' = 'primary';
              if (badge.variant === 'danger') badgeVariant = 'secondary';
              if (badge.variant === 'neutral') badgeVariant = 'outline';
              return <StorefrontBadge key={idx} variant={badgeVariant}>{badge.label}</StorefrontBadge>;
            })}
          </div>
        </div>
      ) : (
        <div className="aspect-[4/3] w-full flex items-center justify-center bg-[var(--storefront-muted)]">
          <span className="text-[var(--storefront-muted-foreground)]">Sem imagem</span>
        </div>
      )}

      <div className="flex flex-col flex-1 p-6 text-center">
        <h3 className="text-xl font-black text-[var(--storefront-foreground)] mb-2 group-hover:text-[var(--storefront-primary)] transition-colors">
          {product.name}
        </h3>

        {showDescription && product.description && (
          <p className="text-sm text-[var(--storefront-muted-foreground)] line-clamp-2 mb-6 italic">
            {product.description}
          </p>
        )}

        <div className="mt-auto flex flex-col items-center gap-4">
          <div className="flex flex-col items-center">
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="text-sm text-[var(--storefront-muted-foreground)] line-through">
                {currencyFormatter(product.compareAtPrice)}
              </span>
            )}
            <span className="text-2xl font-black text-[var(--storefront-foreground)]">
              {currencyFormatter(product.price)}
            </span>
          </div>

          <StorefrontButton fullWidth size="lg" disabled={!product.isAvailable}>
            Adicionar ao Pedido
          </StorefrontButton>
        </div>
      </div>
    </div>
  );
}
