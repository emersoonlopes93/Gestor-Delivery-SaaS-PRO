export type StorefrontProduct = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  compareAtPrice?: number | null;
  categoryName?: string | null;
  isAvailable?: boolean;
  badges?: string[];
};
