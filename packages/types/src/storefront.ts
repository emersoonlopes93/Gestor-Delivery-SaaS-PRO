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
  whatsappNumber?: string | null;
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
  minimumOrderValue?: number | null;
  cashback?: {
    enabled: boolean;
    percent: number;
  };
  scheduling?: {
    enabled: boolean;
  };
}

import { PriceImpactType } from './catalog';

export interface StorefrontOptionItemPayload {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  isAvailable?: boolean;
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
  optionGroupId: string;
  optionGroup: StorefrontOptionGroupPayload;
  order: number;
  pricingAxis?: string | null; // Added for compatibility
  overrideName?: string | null;
  overrideDescription?: string | null; // Added for compatibility
  overrideMinSelect?: number | null;
  overrideMaxSelect?: number | null;
  overrideIsRequired?: boolean | null; // Added for AI agent
}

export interface StorefrontComplementItemPayload {
  id: string;
  name: string;
  description?: string | null; // Added for compatibility
  price: number;
  isActive: boolean;
  isAvailable?: boolean;
  additionalPrice?: number; // Legacy support
}

export interface StorefrontComplementGroupPayload {
  id: string;
  name: string;
  description?: string | null; // Added for compatibility
  minSelect: number;
  maxSelect: number;
  items: StorefrontComplementItemPayload[];
  isRequired?: boolean; // Legacy support
}

export interface StorefrontComplementGroupLinkPayload {
  id: string;
  complementGroupId: string;
  group: StorefrontComplementGroupPayload;
  order: number;
}

export interface ProductBadge {
  id: string;
  label: string;
  variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral';
  priority: number;
}

export interface StorefrontProductPayload {
  id: string;
  name: string;
  slug: string;
  type?: 'simple' | 'combo';
  shortDescription?: string | null;
  description?: string | null;
  longDescription?: string | null; // Added for AI agent
  basePrice: number;
  image?: string | null;
  imageUrl?: string | null;
  imageAltText?: string | null;
  imageSource?: 'TENANT_MEDIA' | 'SYSTEM_GALLERY' | 'EXTERNAL_URL' | 'PLACEHOLDER';
  isAvailable: boolean;
  categoryName?: string;
  categoryId?: string;
  optionGroupLinks: StorefrontOptionGroupLinkPayload[];
  complementGroups: StorefrontComplementGroupLinkPayload[];

  upsellLinks: Array<{
    id: string;
    upsell: StorefrontUpsellPayload;
  }>;
  upsells?: StorefrontUpsellPayload[]; // Legacy support

  badges: ProductBadge[];
  compareAtPrice?: number | null;
}

export interface StorefrontCategoryPayload {
  id: string;
  name: string;
  slug: string;
  order: number;
  templateType?: string; // Added for compatibility
  templateConfig?: Record<string, unknown>;
  type?: 'category' | 'featured' | 'promotions' | 'new' | 'combos' | 'best_sellers';
  isVirtual?: boolean;
  products: StorefrontProductPayload[];
}

export interface StorefrontComboBlockItemPayload {
  id: string;
  productId: string;
  productName: string;
  additionalPrice: number;
}

export interface StorefrontComboPayload {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  basePrice: number;
  image?: string | null;
  isAvailable: boolean;
  comboMode: 'bundle' | 'slot';
  pricingType: 'fixed_price' | 'discount_percent' | 'discount_amount' | null;
  pricingValue: number;
  itemsSubtotal: number;
  discountTotal: number;
  bundleItems: Array<{
    id: string;
    productId: string;
    productName: string;
    qty: number;
    unitPrice: number;
    subtotal: number;
  }>;
  blocks: Array<{
    id: string;
    name: string;
    description?: string | null;
    minSelect: number;
    maxSelect: number;
    items: StorefrontComboBlockItemPayload[];
  }>;
}

export interface StorefrontCustomizationPayload {
  theme: Record<string, unknown>;
  layout: Record<string, unknown>;
}

export interface StorefrontPayload {
  tenant: StorefrontTenantInfo;
  categories: StorefrontCategoryPayload[];
  combos: StorefrontComboPayload[];
  upsells: StorefrontUpsellPayload[];
  customization?: StorefrontCustomizationPayload;
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

export interface CartSelectedOptionItem {
  optionItemId: string;
  name: string;
  priceImpactType: string;
  priceImpactValue: number;
  qty: number;
}

export interface CartSelectedOptionGroup {
  optionGroupId: string;
  name: string;
  items: CartSelectedOptionItem[];
}

export interface CartSelectedComplement {
  groupId: string;
  itemId: string;
  name: string;
  price: number;
}

export interface CartSelectedComboItem {
  blockId: string;
  productId: string;
  blockItemId?: string; // Compatibility
  price?: number;
}

export interface CartSelectedComboSlotItem {
  productId: string;
  name: string;
  additionalPrice: number;
  qty: number;
}

export interface CartSelectedComboSlot {
  blockId: string;
  productId: string;
  comboSlotId?: string; // Compatibility
  items?: CartSelectedComboSlotItem[];
}

export interface CartLineItem {
  id?: string;
  cartLineId: string;
  productId?: string;
  comboId?: string;
  name?: string;
  image?: string | null;
  price?: number;
  qty?: number;
  quantity: number;
  notes?: string;
  options?: unknown[];

  comboItems?: CartSelectedComboItem[];
  type?: 'simple' | 'combo';
  selections?: CartSelectedOptionGroup[];
  slots?: CartSelectedComboSlot[];
  selectedOptions?: CartSelectedComplement[]; // Legacy
  selectedComboItems?: CartSelectedComboItem[]; // Legacy
  snapshot: CartSnapshot;
  bundleItems?: unknown[]; // Compatibility
  sourceUpsellId?: string; // Compatibility
}

export interface CartBundleItemSnapshot {
  productId: string;
  productName?: string; // Compatibility
  name: string;
  qty: number;
}

export interface CartSnapshot {
  productName: string;
  productImage?: string | null;
  basePrice: number;
  lineSubtotal: number;
  extrasDescription: string; // Ex: "Sem Cebola, + Bacon"
  items: Array<{
    id: string;
    name: string;
    qty: number;
    price: number;
    type: 'option' | 'complement';
  }>;
}
