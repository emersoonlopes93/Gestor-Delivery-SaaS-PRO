import { StorefrontProductLayout } from '@gestor/theme';

interface ProductRendererProps {
  layout: StorefrontProductLayout;
  product: any; // Using any temporarily as requested to not change API/schema yet
  onClick?: (product: any) => void;
}

export function ProductRenderer({ layout, product, onClick }: ProductRendererProps) {
  // Placeholder components for different layouts
  // In a real scenario, these would be separate components in the package
  
  switch (layout) {
    case 'list':
      return <div onClick={() => onClick?.(product)} className="p-4 border-b">List Item: {product.name}</div>;
    case 'grid':
      return <div onClick={() => onClick?.(product)} className="p-4 border rounded-xl">Grid Card: {product.name}</div>;
    case 'compact':
      return <div onClick={() => onClick?.(product)} className="p-2 border rounded-lg text-sm">Compact: {product.name}</div>;
    case 'square':
      return <div onClick={() => onClick?.(product)} className="aspect-square border flex items-center justify-center">Square: {product.name}</div>;
    case 'premium-card':
      return <div onClick={() => onClick?.(product)} className="p-6 shadow-xl border-primary border-2 rounded-2xl">Premium: {product.name}</div>;
    default:
      return <div onClick={() => onClick?.(product)} className="p-4 border rounded-xl">Default: {product.name}</div>;
  }
}
