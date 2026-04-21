// ============================================================
// PROMOTIONS & CASHBACK DOMAIN TYPES — Phase 8
// ============================================================

export type CouponType = 'percentage' | 'fixed';

export interface CouponDTO {
  id: string;
  tenantId: string;
  code: string;
  type: CouponType;
  value: number;
  minOrderValue?: number | null;
  usageLimit?: number | null;
  usedCount: number;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CashbackTransactionType = 'earned' | 'redeemed' | 'adjustment' | 'expired';

export interface CashbackTransactionDTO {
  id: string;
  tenantId: string;
  customerId: string;
  orderId?: string | null;
  type: CashbackTransactionType;
  amount: number;
  description?: string | null;
  createdAt: string;
}

import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsEnum, IsDateString } from 'class-validator';

export class CreateCouponDTO {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsOptional() description?: string;
  @IsEnum(['percentage', 'fixed_amount', 'free_shipping']) type!: CouponType;
  @IsNumber() @IsNotEmpty() value!: number;
  @IsNumber() @IsOptional() minOrderValue?: number;
  @IsNumber() @IsOptional() maxDiscountValue?: number;
  @IsNumber() @IsOptional() usageLimit?: number;
  @IsDateString() @IsOptional() startsAt?: string;
  @IsDateString() @IsOptional() expiresAt?: string;
}

export class UpdateCouponDTO {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @IsOptional() minOrderValue?: number;
  @IsNumber() @IsOptional() maxDiscountValue?: number;
  @IsNumber() @IsOptional() usageLimit?: number;
  @IsDateString() @IsOptional() startsAt?: string;
  @IsDateString() @IsOptional() expiresAt?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
