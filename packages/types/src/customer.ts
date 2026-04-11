// ============================================================
// CUSTOMER & CRM DOMAIN TYPES — Phase 8
// ============================================================

export interface CustomerDTO {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string | null;
  loyaltyPoints: number;
  cashbackBalance: number;
  createdAt: string;
  updatedAt: string;
}

// Em algumas telas a listagem não precisa do detalhe transacional
export type CustomerListItemDTO = Omit<CustomerDTO, 'notes'>;

import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';

export class UpdateCustomerDTO {
  @IsString() @IsNotEmpty() @IsOptional()
  name?: string;

  @IsEmail() @IsOptional()
  email?: string;

  @IsString() @IsOptional()
  notes?: string;
}
