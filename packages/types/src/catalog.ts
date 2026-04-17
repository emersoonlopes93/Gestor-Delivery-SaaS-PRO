import { z } from 'zod';

export type CategoryTemplateType = 'none' | 'pizza';

export interface ProductCategory {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  templateType: CategoryTemplateType;
  templateConfig?: any | null;
  isActive: boolean;
  isFeatured: boolean;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId?: string | null;
  type?: CatalogProductType;
  comboMode?: ComboMode | null;
  comboPricingType?: ComboPricingType | null;
  comboPricingValue?: number | string | null;
  name: string;
  slug: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  basePrice: number | string; // usually strings when decimal serialized
  image?: string | null;
  isActive: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  sellableOnline: boolean;
  sku?: string | null;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null;
}

export interface ProductComplementGroup {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  isActive: boolean;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProductComplementItem {
  id: string;
  tenantId: string;
  groupId: string;
  name: string;
  description?: string | null;
  additionalPrice: number | string;
  sku?: string | null;
  isActive: boolean;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProductCombo {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string | null;
  basePrice: number | string;
  image?: string | null;
  isActive: boolean;
  isFeatured: boolean;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string | null;
}

export interface ProductComboBlock {
  id: string;
  tenantId: string;
  comboId: string;
  name: string;
  description?: string | null;
  minSelect: number;
  maxSelect: number;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProductComboBlockItem {
  id: string;
  tenantId: string;
  blockId: string;
  productId: string;
  additionalPrice: number | string;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================
// DTOs for Creation and Update
// ============================================

export interface CreateCategoryDto {
  name: string;
  description?: string;
  image?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  order?: number;
}

export interface UpdateCategoryDto extends Partial<CreateCategoryDto> {}

export interface CreateProductDto {
  name: string;
  categoryId?: string;
  type?: CatalogProductType;
  comboMode?: ComboMode;
  comboPricingType?: ComboPricingType;
  comboPricingValue?: number;
  shortDescription?: string;
  longDescription?: string;
  basePrice: number;
  image?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  isAvailable?: boolean;
  sellableOnline?: boolean;
  sku?: string;
  order?: number;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {}

export interface CreateProductComplementGroupDto {
  name: string;
  description?: string;
  minSelect?: number;
  maxSelect?: number;
  isRequired?: boolean;
  isActive?: boolean;
  order?: number;
}

export interface UpdateProductComplementGroupDto extends Partial<CreateProductComplementGroupDto> {}

export interface CreateProductComboDto {
  name: string;
  description?: string;
  basePrice: number;
  image?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  order?: number;
}

export interface UpdateProductComboDto extends Partial<CreateProductComboDto> {}

export interface CreateProductComboBlockDto {
  comboId: string;
  name: string;
  description?: string;
  minSelect?: number;
  maxSelect?: number;
  order?: number;
}

export interface UpdateProductComboBlockDto extends Partial<CreateProductComboBlockDto> {}

export interface CreateProductComboBlockItemDto {
  blockId: string;
  productId: string;
  additionalPrice?: number;
  order?: number;
}

export interface UpdateProductComboBlockItemDto extends Partial<CreateProductComboBlockItemDto> {}

export type CatalogProductType = 'simple' | 'configurable' | 'combo';
export type ComboMode = 'bundle' | 'slot';
export type ComboPricingType = 'fixed_price' | 'discount_percent' | 'discount_amount';

export type OptionSelectionType = 'single' | 'multiple' | 'quantity';

export type PriceImpactType = 'none' | 'fixed' | 'replace' | 'percentage';

export type PricingAxis = 'primary' | 'secondary';

export type CatalogPublicationStatus = 'draft' | 'published';

export type CatalogOperationalStatus = 'active' | 'inactive' | 'hidden' | 'sold_out_manual';

export type CatalogSalesChannel = 'storefront_delivery' | 'storefront_pickup' | 'pos';

export interface OptionGroup {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  selectionType: OptionSelectionType;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OptionItem {
  id: string;
  tenantId: string;
  optionGroupId: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  isActive: boolean;
  order: number;
  priceImpactType: PriceImpactType;
  priceImpactValue: number | string;
  allowQuantity: boolean;
  minQty?: number | null;
  maxQty?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProductOptionGroupLink {
  id: string;
  tenantId: string;
  productId: string;
  optionGroupId: string;
  order: number;
  overrideName?: string | null;
  overrideDescription?: string | null;
  overrideIsRequired?: boolean | null;
  overrideMinSelect?: number | null;
  overrideMaxSelect?: number | null;
  pricingAxis: PricingAxis;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CatalogPublication {
  id: string;
  tenantId: string;
  productId: string;
  publicationStatus: CatalogPublicationStatus;
  operationalStatus: CatalogOperationalStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CatalogAvailabilityRule {
  id: string;
  tenantId: string;
  publicationId: string;
  channel: CatalogSalesChannel;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ComboSlot {
  id: string;
  tenantId: string;
  comboProductId: string;
  name: string;
  description?: string | null;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ComboSlotAllowedItem {
  id: string;
  tenantId: string;
  comboSlotId: string;
  productId: string;
  additionalPrice: number | string;
  order: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ComboBundleItem {
  id: string;
  tenantId: string;
  comboProductId: string;
  productId: string;
  qty: number;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateComboBundleItemDto {
  comboProductId: string;
  productId: string;
  qty?: number;
  sortOrder?: number;
}

export interface UpdateComboBundleItemDto extends Partial<CreateComboBundleItemDto> {}

export interface CreateOptionGroupDto {
  name: string;
  description?: string;
  selectionType: OptionSelectionType;
  isRequired?: boolean;
  minSelect?: number;
  maxSelect?: number;
  isActive?: boolean;
  order?: number;
}

export interface UpdateOptionGroupDto extends Partial<CreateOptionGroupDto> {}

export interface CreateOptionItemDto {
  optionGroupId: string;
  name: string;
  description?: string;
  sku?: string;
  isActive?: boolean;
  order?: number;
  priceImpactType?: PriceImpactType;
  priceImpactValue?: number;
  allowQuantity?: boolean;
  minQty?: number;
  maxQty?: number;
}

export interface UpdateOptionItemDto extends Partial<CreateOptionItemDto> {}

export interface CreateProductOptionGroupLinkDto {
  productId: string;
  optionGroupId: string;
  order?: number;
  overrideName?: string;
  overrideDescription?: string;
  overrideIsRequired?: boolean;
  overrideMinSelect?: number;
  overrideMaxSelect?: number;
  pricingAxis?: PricingAxis;
}

export interface UpdateProductOptionGroupLinkDto extends Partial<CreateProductOptionGroupLinkDto> {}

export interface UpsertPublicationDto {
  publicationStatus?: CatalogPublicationStatus;
  operationalStatus?: CatalogOperationalStatus;
}

export interface CreateAvailabilityRuleDto {
  channel: CatalogSalesChannel;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export interface UpdateAvailabilityRuleDto extends Partial<CreateAvailabilityRuleDto> {}

export interface CreateComboSlotDto {
  comboProductId: string;
  name: string;
  description?: string;
  isRequired?: boolean;
  minSelect?: number;
  maxSelect?: number;
  order?: number;
}

export interface UpdateComboSlotDto extends Partial<CreateComboSlotDto> {}

export interface CreateComboSlotAllowedItemDto {
  comboSlotId: string;
  productId: string;
  additionalPrice?: number;
  order?: number;
}

export interface UpdateComboSlotAllowedItemDto extends Partial<CreateComboSlotAllowedItemDto> {}

// ============================================
// ZOD SCHEMAS FOR TEMPLATE CONFIGS
// ============================================

export const PizzaTemplateConfigSchema = z.object({
  pricingStrategy: z.enum(['highest', 'lowest', 'average', 'sum_halves']).default('highest'),
});

export type PizzaTemplateConfig = z.infer<typeof PizzaTemplateConfigSchema>;

export const CategoryTemplateConfigSchema = z.record(z.any()).optional();

// ============================================
// SHARED TYPES FOR CATALOG V2
// ============================================

export interface ProductDetails extends Product {
  category?: ProductCategory | null;
  optionGroupLinks?: Array<ProductOptionGroupLink & { optionGroup: OptionGroup & { items?: OptionItem[] } }>;
  comboSlots?: Array<ComboSlot & { allowedItems?: Array<ComboSlotAllowedItem & { product?: Product }> }>;
  publication?: (CatalogPublication & { rules?: CatalogAvailabilityRule[] }) | null;
  optionItemPrices?: Array<{ id: string; optionItemId: string; price: number | string }>;
  upsellLinks?: Array<ProductUpsell & { upsell: Upsell & { items: Array<UpsellItem & { product: Product }> } }>;
}

// ============================================
// UPSELLS (Phase 11)
// ============================================

export type UpsellType = 'product_list' | 'category_based';
export type UpsellPricingType = 'normal' | 'discount_percent' | 'discount_amount' | 'fixed_price';
export type UpsellDisplayType = 'inline' | 'cart' | 'both';

export interface Upsell {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  upsellType: UpsellType;
  pricingType: UpsellPricingType;
  pricingValue: number | string;
  displayType: UpsellDisplayType;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UpsellItem {
  id: string;
  tenantId: string;
  upsellId: string;
  productId: string;
  sortOrder: number;
}

export interface ProductUpsell {
  id: string;
  tenantId: string;
  productId: string;
  upsellId: string;
}

export interface CreateUpsellDto {
  name: string;
  description?: string;
  imageUrl?: string;
  upsellType?: UpsellType;
  pricingType?: UpsellPricingType;
  pricingValue?: number;
  displayType?: UpsellDisplayType;
  isActive?: boolean;
}

export interface UpdateUpsellDto extends Partial<CreateUpsellDto> {}

export interface UpsellWithItems extends Upsell {
  items: Array<UpsellItem & { product: Product }>;
}
