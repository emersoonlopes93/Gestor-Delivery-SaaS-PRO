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
    paymentMethods?: string[];
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
export interface StorefrontProductPayload {
    id: string;
    name: string;
    slug: string;
    shortDescription?: string | null;
    longDescription?: string | null;
    basePrice: number;
    image?: string | null;
    isAvailable: boolean;
    complements: StorefrontComplementGroup[];
    upsells: StorefrontUpsellPayload[];
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
    isAvailable: boolean;
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
    isAvailable: boolean;
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
export interface CartSnapshot {
    productName: string;
    productImage?: string | null;
    basePrice: number;
    lineSubtotal: number;
    extrasDescription: string;
}
export interface CartSelectedComplement {
    groupId: string;
    itemId: string;
    name: string;
    price: number;
}
export interface CartSelectedComboItem {
    blockId: string;
    blockItemId: string;
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
    cartLineId: string;
    productId?: string;
    comboId?: string;
    quantity: number;
    notes?: string;
    selectedOptions?: CartSelectedComplement[];
    selectedComboItems?: CartSelectedComboItem[];
    bundleItems?: CartBundleItemSnapshot[];
    sourceUpsellId?: string;
    snapshot: CartSnapshot;
}
export interface CartState {
    items: CartLineItem[];
    subtotal: number;
    tenantId: string;
}
