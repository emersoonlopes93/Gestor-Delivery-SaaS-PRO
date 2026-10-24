export type StorefrontProduct = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  compareAtPrice?: number | null;
  categoryName?: string | null;
  isAvailable?: boolean;
  badges?: Array<{ id: string; label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral' }>;
  pricePrefix?: string;
};

export type StorefrontProductSource = {
  id: string;
  name: string;
  shortDescription?: string | null;
  image?: string | null;
  basePrice: number;
  compareAtPrice?: number | null;
  isAvailable?: boolean;
  badges?: StorefrontProduct['badges'];
  startingPrice?: number | null;
};

export function toStorefrontProduct(source: StorefrontProductSource): StorefrontProduct {
  return {
    id: source.id,
    name: source.name,
    description: source.shortDescription,
    imageUrl: source.image,
    price: source.startingPrice ?? source.basePrice,
    compareAtPrice: source.compareAtPrice,
    isAvailable: source.isAvailable,
    badges: source.badges,
    pricePrefix: source.startingPrice !== null && source.startingPrice !== undefined ? 'A partir de' : undefined,
  };
}
