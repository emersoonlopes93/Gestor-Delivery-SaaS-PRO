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
};

export function toStorefrontProduct(source: StorefrontProductSource): StorefrontProduct {
  return {
    id: source.id,
    name: source.name,
    description: source.shortDescription,
    imageUrl: source.image,
    price: source.basePrice,
    compareAtPrice: source.compareAtPrice,
    isAvailable: source.isAvailable,
    badges: source.badges,
  };
}
