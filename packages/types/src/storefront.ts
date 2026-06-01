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
  primaryColor?: string | null;
  paymentMethods?: string[];
  mercadoPagoPublicKey?: string | null;
  address?: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    lat?: number;
    lng?: number;
  };
}

import { PriceImpactType, PricingAxis } from './catalog';

export interface StorefrontOptionItemPayload {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  allowQuantity: boolean;
  priceImpactType: PriceImpactType;
  priceImpactValue: number;
}

export interface StorefrontOptionGroupPayload {
  id: string;
  name: string;
  description?: string | null;
  selectionType: 'single' | 'multiple' | 'quantity';
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
  items: StorefrontOptionItemPayload[];
}

export interface StorefrontOptionGroupLinkPayload {
  id: string;
  pricingAxis?: PricingAxis;
  overrideName?: string | null;
  overrideDescription?: string | null;
  overrideIsRequired?: boolean | null;
  overrideMinSelect?: number | null;
  overrideMaxSelect?: number | null;
  optionGroup: StorefrontOptionGroupPayload;
}

// Layer 2: Published entity, Layer 3: Currently available to sell
export interface StorefrontProductPayload {
  id: string;
  name: string;
  slug: string;
  type: 'simple' | 'configurable' | 'combo';
  shortDescription?: string | null;
  longDescription?: string | null;
  basePrice: number;
  image?: string | null;
  isAvailable: boolean; // Layer 3 
  complements: StorefrontComplementGroup[]; // Legacy
  optionGroupLinks: StorefrontOptionGroupLinkPayload[]; // V2
  upsells: StorefrontUpsellPayload[];
}

export interface StorefrontCategoryPayload {
  id: string;
  name: string;
  slug: string;
  templateType?: string | null;
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
  upsells: StorefrontUpsellPayload[];
}

export interface StorefrontUpsellItemPayload {
  productId: string;
  name: string;
  image?: string | null;
  originalPrice: number;
  finalPrice: number;
  discountApplied: number;
}

export interface StorefrontUpsellPayload {
  id: string;
  name: string;
  description?: string | null;
  displayType: 'inline' | 'cart' | 'both';
  items: StorefrontUpsellItemPayload[];
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

export interface CartSelectedOptionItem {
  optionItemId: string;
  qty?: number;
  name: string;
  priceImpactType: PriceImpactType;
  priceImpactValue: number;
}

export interface CartSelectedOptionGroup {
  optionGroupId: string;
  name: string;
  items: CartSelectedOptionItem[];
}

export interface CartSelectedComboSlotItem {
  productId: string;
  qty?: number;
  name: string;
  additionalPrice: number;
}

export interface CartSelectedComboSlot {
  comboSlotId: string;
  name: string;
  items: CartSelectedComboSlotItem[];
}

export interface CartLineItem {
  cartLineId: string; // UUID unique per line
  productId?: string; // either product
  comboId?: string; // or combo
  quantity: number;
  notes?: string;
  
  // Options for single products (Legacy)
  selectedOptions?: CartSelectedComplement[];
  
  // Options for Catalog V2
  selections?: CartSelectedOptionGroup[];
  slots?: CartSelectedComboSlot[];

  // Options for combos (Legacy)
  selectedComboItems?: CartSelectedComboItem[];
  bundleItems?: CartBundleItemSnapshot[];

  sourceUpsellId?: string; // If this item was added via an upsell offer

  snapshot: CartSnapshot; // Commercial snapshot frozen at add time
}

// Example Cart State
export interface CartState {
  items: CartLineItem[];
  subtotal: number;
  tenantId: string;
}
