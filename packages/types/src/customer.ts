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

import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class UpdateCustomerDTO {
  @IsString() @IsNotEmpty() @IsOptional()
  name?: string;

  @IsEmail() @IsOptional()
  email?: string;

  @IsString() @IsOptional()
  notes?: string;
}

export class CreateCustomerDTO {
  @IsString() @IsNotEmpty()
  name!: string;

  @IsString() @IsNotEmpty()
  phone!: string;

  @IsEmail() @IsOptional()
  email?: string;

  @IsString() @IsOptional()
  notes?: string;
}

export interface CustomerAddressDTO {
  id: string;
  tenantId: string;
  customerId: string;
  label?: string | null;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  reference?: string | null;
  lat?: number | null;
  lng?: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CustomerAddressSummaryDTO = Pick<
  CustomerAddressDTO,
  | 'id'
  | 'label'
  | 'street'
  | 'number'
  | 'complement'
  | 'neighborhood'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'reference'
  | 'lat'
  | 'lng'
  | 'isDefault'
>;

export interface PosCustomerSearchResultDTO {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  lastOrderAt?: string | null;
  orderCount: number;
  addresses: CustomerAddressSummaryDTO[];
}

export interface PublicCustomerProfileAddressDTO extends CustomerAddressSummaryDTO {
  id: string;
  label?: string | null;
}

export class UpsertCustomerAddressDTO {
  @IsString() @IsOptional()
  label?: string;

  @IsString() @IsNotEmpty()
  street!: string;

  @IsString() @IsNotEmpty()
  number!: string;

  @IsString() @IsOptional()
  complement?: string;

  @IsString() @IsNotEmpty()
  neighborhood!: string;

  @IsString() @IsOptional()
  city?: string;

  @IsString() @IsOptional()
  state?: string;

  @IsString() @IsOptional()
  zipCode?: string;

  @IsString() @IsOptional()
  reference?: string;

  @IsNumber() @IsOptional()
  lat?: number;

  @IsNumber() @IsOptional()
  lng?: number;

  @IsBoolean() @IsOptional()
  isDefault?: boolean;
}
