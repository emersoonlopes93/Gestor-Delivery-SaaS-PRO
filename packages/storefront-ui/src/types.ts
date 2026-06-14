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
