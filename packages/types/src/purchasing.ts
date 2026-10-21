import { PurchaseStatus, PaymentStatus, UnitType } from './enums';

export interface SupplierDTO {
  id: string;
  tenantId: string;
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  contactName?: string;
  category?: string;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateSupplierDTO {
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  contactName?: string;
  category?: string;
  isActive?: boolean;
}

export interface UpdateSupplierDTO {
  name?: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  contactName?: string;
  category?: string;
  isActive?: boolean;
}

export interface PurchaseDTO {
  id: string;
  tenantId: string;
  supplierId: string;
  number?: string;
  totalValue: number;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
  purchaseDate: Date;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt?: Date;
  settlement?: PurchaseSettlementDTO;
  supplier?: SupplierDTO;
  items?: PurchaseItemDTO[];
}

export interface PurchaseItemDTO {
  id: string;
  tenantId: string;
  purchaseId: string;
  ingredientId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  /** Null for historical purchases that predate purchase presentations. */
  purchasePresentationId?: string;
  purchaseQuantity?: number;
  purchasePresentationLabel?: string;
  conversionFactorSnapshot?: number;
  purchasePresentationContentQuantitySnapshot?: number;
  purchasePresentationContentUnitSnapshot?: UnitType;
  ingredientBaseUnitSnapshot?: UnitType;
  expiryDate?: Date;
  ingredientName?: string; // Helpful for UI
}

export interface CreatePurchaseDTO {
  supplierId: string;
  number?: string;
  purchaseDate?: Date | string;
  items: CreatePurchaseItemDTO[];
  paymentStatus?: PaymentStatus;
  accountId?: string;
  idempotencyKey: string;
}

export interface PayPurchaseDTO {
  accountId: string;
}

export interface PurchaseSettlementDTO {
  id: string;
  purchaseId: string;
  accountId: string;
  amount: number;
  financialTransactionId: string;
  paidAt: Date;
  reversedAt?: Date;
  reversalTransactionId?: string;
}

export interface CreatePurchaseItemDTO {
  ingredientId: string;
  /** Quantity in the supplier's commercial presentation. */
  purchaseQuantity?: number;
  /** Optional only for a direct unit-base purchase (factor = 1). */
  purchasePresentationId?: string;
  /** Total amount paid for this line; server derives all base-unit values. */
  lineTotal?: number;
  /** @deprecated Legacy unit-base input; retained only for compatible clients. */
  quantity?: number;
  /** @deprecated Legacy unit-base input; retained only for compatible clients. */
  unitCost?: number;
  expiryDate?: Date;
}

export interface PurchasePresentationDTO {
  id: string;
  tenantId: string;
  ingredientId: string;
  label: string;
  conversionFactor: number;
  /** Explicit commercial content. Null means a legacy presentation that needs review. */
  contentQuantity?: number | null;
  contentUnit?: UnitType | null;
  /** Derived read status; never persisted independently. */
  status: 'CANONICAL' | 'LEGACY_REQUIRES_REVIEW' | 'ARCHIVED';
  isActive: boolean;
  archivedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreatePurchasePresentationDTO {
  label: string;
  contentQuantity: number;
  contentUnit: UnitType;
}

export interface UpdatePurchasePresentationDTO {
  label?: string;
  /** Both fields are required together when canonicalizing or changing content. */
  contentQuantity?: number;
  contentUnit?: UnitType;
}

export interface UpdatePurchaseDTO {
  status?: PurchaseStatus;
  paymentStatus?: PaymentStatus;
}
