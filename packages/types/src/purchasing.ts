import { PurchaseStatus, PaymentStatus } from './enums';

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
  quantity: number;
  unitCost: number;
  expiryDate?: Date;
}

export interface UpdatePurchaseDTO {
  status?: PurchaseStatus;
  paymentStatus?: PaymentStatus;
}
