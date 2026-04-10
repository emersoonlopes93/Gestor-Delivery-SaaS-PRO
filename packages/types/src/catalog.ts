export interface ProductCategory {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
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
