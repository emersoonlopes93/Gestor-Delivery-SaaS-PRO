import { PurchaseStatus, PaymentStatus } from './enums';

export interface SupplierDTO {
  id: string;
  tenantId: string;
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupplierDTO {
  name: string;
  cnpj?: string;
  email?: string;
  phone?: string;
}

export interface UpdateSupplierDTO {
  name?: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  active?: boolean;
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
  purchaseDate?: Date;
  items: CreatePurchaseItemDTO[];
  paymentStatus?: PaymentStatus;
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
