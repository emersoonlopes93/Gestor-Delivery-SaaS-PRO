import {
  CreateAvailabilityRuleDto,
  CreateComboBundleItemDto,
  CreateComboSlotDto,
  CreateProductDto,
  UpsertPublicationDto,
  ProductCategory,
} from '@gestor/types';

export type CatalogProductFormState = {
  // Wizard State (Transient UI State)
  wizardStep: number;
  
  // Basic Info
  productForm: CreateProductDto;
  imageFile: File | null;
  imagePreviewUrl: string | null;
  pizzaPrices: Record<string, number>;
  categories: ProductCategory[];
  bundleSummary?: {
    subtotal: number;
    discountTotal: number;
    finalPrice: number;
    pricingType: 'fixed_price' | 'discount_percent' | 'discount_amount';
    pricingValue: number;
  } | null;

  // Publication
  publication: UpsertPublicationDto;

  // Availability Rules
  rules: CreateAvailabilityRuleDto[];

  // For Combos
  slots: CreateComboSlotDto[];
  bundleItems: CreateComboBundleItemDto[];
};
