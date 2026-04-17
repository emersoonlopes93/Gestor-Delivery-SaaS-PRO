export interface StorefrontTenantInfo {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logo?: string | null;
  banner?: string | null;
  isOpen: boolean; 
  statusMessage?: string | null;
  nextOpenAt?: string | null;
}

// Layer 2: Published entity, Layer 3: Currently available to sell
export interface StorefrontProductPayload {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  basePrice: number;
  image?: string | null;
  isAvailable: boolean; // Layer 3 
  complements: StorefrontComplementGroup[];
}

export interface StorefrontCategoryPayload {
  id: string;
  name: string;
  slug: string;
  products: StorefrontProductPayload[];
}

export interface StorefrontComplementGroup {
  id: string;
  name: string;
  description?: string | null;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  items: StorefrontComplementItem[];
}

export interface StorefrontComplementItem {
  id: string;
  name: string;
  description?: string | null;
  additionalPrice: number;
  isAvailable: boolean; // Layer 3
}

export interface StorefrontComboBlockItemPayload {
  id: string;
  productId: string;
  productName: string;
  additionalPrice: number;
}

export interface StorefrontComboBlockPayload {
  id: string;
  name: string;
  description?: string | null;
  minSelect: number;
  maxSelect: number;
  items: StorefrontComboBlockItemPayload[];
}

export interface StorefrontComboPayload {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  basePrice: number;
  image?: string | null;
  isAvailable: boolean; // Layer 3
  comboMode?: 'bundle' | 'slot';
  pricingType?: 'fixed_price' | 'discount_percent' | 'discount_amount';
  pricingValue?: number;
  itemsSubtotal?: number;
  discountTotal?: number;
  blocks?: StorefrontComboBlockPayload[];
  bundleItems?: Array<{
    id: string;
    productId: string;
    productName: string;
    qty: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

export interface StorefrontPayload {
  tenant: StorefrontTenantInfo;
  categories: StorefrontCategoryPayload[];
  combos: StorefrontComboPayload[];
}

// -------------------------------------------------------------
// CART & SNAPSHOT TYPES
// -------------------------------------------------------------

export interface CartSnapshot {
  productName: string;
  productImage?: string | null;
  basePrice: number;
  lineSubtotal: number;
  extrasDescription: string; // Ex: "Sem Cebola, + Bacon"
}

export interface CartSelectedComplement {
  groupId: string;
  itemId: string;
  name: string;
  price: number;
}

export interface CartSelectedComboItem {
  blockId: string;
  blockItemId: string; // which maps to a product
  productId: string;
  productName: string;
  price: number;
}

export interface CartBundleItemSnapshot {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
}

export interface CartLineItem {
  cartLineId: string; // UUID unique per line
  productId?: string; // either product
  comboId?: string; // or combo
  quantity: number;
  notes?: string;
  
  // Options for single products
  selectedOptions?: CartSelectedComplement[];
  
  // Options for combos
  selectedComboItems?: CartSelectedComboItem[];
  bundleItems?: CartBundleItemSnapshot[];

  snapshot: CartSnapshot; // Commercial snapshot frozen at add time
}

// Example Cart State
export interface CartState {
  items: CartLineItem[];
  subtotal: number;
  tenantId: string;
}
