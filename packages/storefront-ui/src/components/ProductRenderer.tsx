import { StorefrontProductLayout, StorefrontImageMode } from '@gestor/theme';
import { StorefrontProduct } from '../types';
import { ProductGridCard } from './ProductGridCard';
import { ProductListItem } from './ProductListItem';
import { ProductCompactCard } from './ProductCompactCard';
import { ProductSquareCard } from './ProductSquareCard';
import { ProductPremiumCard } from './ProductPremiumCard';

import { ProductCardProps } from './ProductGridCard';

interface ProductRendererProps {
  product: StorefrontProduct;
  layout: StorefrontProductLayout;
  imageMode?: StorefrontImageMode;
  showDescription?: boolean;
  showBadges?: boolean;
  onSelectProduct?: (product: StorefrontProduct) => void;
  currencyFormatter?: (value: number) => string;
}

/**
 * ProductRenderer - Orchestrates the rendering of products based on selected layout.
 * Ensures visual consistency while allowing tenant customization.
 */
export function ProductRenderer({ 
  product, 
  layout, 
  imageMode = 'cover',
  showDescription = true,
  showBadges = true,
  onSelectProduct,
  currencyFormatter
}: ProductRendererProps) {
  const commonProps: ProductCardProps = {
    product,
    onClick: onSelectProduct,
    currencyFormatter,
    showDescription,
    showBadges,
    imageMode: imageMode === 'hidden' ? 'hidden' : (imageMode as 'cover' | 'contain')
  };

  switch (layout) {
    case 'list':
      return <ProductListItem {...commonProps} />;
    case 'grid':
      return <ProductGridCard {...commonProps} />;
    case 'compact':
      return <ProductCompactCard {...commonProps} />;
    case 'square':
      return <ProductSquareCard {...commonProps} />;
    case 'premium-card':
      return <ProductPremiumCard {...commonProps} />;
    default:
      return <ProductGridCard {...commonProps} />;
  }
}

