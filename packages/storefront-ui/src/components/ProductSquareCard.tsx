import { ProductCardProps } from './ProductGridCard';
import { StorefrontBadge } from './StorefrontBadge';
import { cn } from '../cn';

export function ProductSquareCard({
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
        'group relative aspect-square bg-[var(--storefront-card)] border border-[var(--storefront-border)] rounded-[var(--storefront-radius)] overflow-hidden transition-all hover:border-[var(--storefront-primary)] cursor-pointer',
        !product.isAvailable && 'opacity-60 grayscale'
      )}
    >
      {hasImage ? (
        <img 
          src={product.imageUrl!} 
          alt={product.name}
          className={cn(
            'w-full h-full transition-transform group-hover:scale-105',
            imageMode === 'cover' ? 'object-cover' : 'object-contain'
          )}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[var(--storefront-muted)]">
          <span className="text-[var(--storefront-muted-foreground)] text-[10px] uppercase font-bold tracking-widest">Sem imagem</span>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3">
        <div className="flex flex-wrap gap-1 mb-1">
          {showBadges && product.badges?.map((badge, idx) => (
            <StorefrontBadge key={idx} variant="primary" className="bg-white text-black border-none">{badge}</StorefrontBadge>
          ))}
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
