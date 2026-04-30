import { UnitType, StockMovementType, InventoryCountStatus } from './enums';

export interface IngredientDTO {
  id: string;
  tenantId: string;
  name: string;
  sku?: string;
  description?: string;
  unit: UnitType;
  purchaseUnit?: UnitType;
  conversionFactor: number;
  category?: string;
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
  purchaseUnit?: UnitType;
  conversionFactor?: number;
  category?: string;
  minStock?: number;
  initialPurchase?: {
    quantity: number;
    unit: UnitType;
    totalCost: number;
    supplierId?: string;
  };
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

export interface InventoryCountDTO {
  id: string;
  tenantId: string;
  status: InventoryCountStatus;
  note?: string;
  openedAt: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  items?: InventoryCountItemDTO[];
}

export interface InventoryCountItemDTO {
  id: string;
  tenantId: string;
  inventoryCountId: string;
  ingredientId: string;
  theoreticalStock: number;
  physicalStock: number;
  adjustedQuantity: number;
  ingredientName?: string;
  ingredientUnit?: UnitType;
}

export interface CreateInventoryCountDTO {
  note?: string;
  items: CreateInventoryCountItemDTO[];
}

export interface CreateInventoryCountItemDTO {
  ingredientId: string;
  theoreticalStock: number;
  physicalStock: number;
}
