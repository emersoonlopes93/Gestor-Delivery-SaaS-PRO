import { UnitType, StockMovementType } from '@gestor/core';
export { UnitType, StockMovementType };

export interface IngredientDTO {
  id: string;
  tenantId: string;
  name: string;
  sku?: string;
  description?: string;
  unit: UnitType;
  currentCost: number;
  currentStock: number;
  minStock?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIngredientDTO {
  name: string;
  sku?: string;
  description?: string;
  unit: UnitType;
  currentCost: number;
  minStock?: number;
}

export interface UpdateIngredientDTO extends Partial<CreateIngredientDTO> {
  isActive?: boolean;
}

export interface StockMovementDTO {
  id: string;
  tenantId: string;
  ingredientId: string;
  type: StockMovementType;
  quantity: number;
  unitCost?: number;
  orderId?: string;
  userId?: string;
  notes?: string;
  createdAt: Date;
}

export interface CreateStockMovementDTO {
  ingredientId: string;
  type: Exclude<StockMovementType, StockMovementType.THEORETICAL_DEPLETION>;
  quantity: number;
  unitCost?: number;
  notes?: string;
}

export interface RecipeIngredientDTO {
  id: string;
  ingredientId: string;
  ingredientName?: string;
  ingredientUnit?: UnitType;
  quantity: number;
  estimatedCost?: number;
}

export interface UpsertRecipeDTO {
  ingredientId: string;
  quantity: number;
}

export interface ProductRecipeDTO {
  productId: string;
  ingredients: RecipeIngredientDTO[];
  totalEstimatedCost: number;
}

export interface IngredientStatsDTO {
  id: string;
  name: string;
  unit: UnitType;
  currentStock: number;
  estimatedConsumption: number; // Theoretical depletion in last 30 days or so
  lastMovementDate?: Date;
}
