import { IsNumber, IsOptional, IsString, IsEnum, Min } from 'class-validator';

// ============================================================
// CASH SESSION ENUMS
// ============================================================

import { CashSessionStatus, CashMovementType } from './enums';

// ============================================================
// CASH DTOs — Input
// ============================================================

export class OpenCashSessionDTO {
  @IsNumber()
  @Min(0)
  openingAmount!: number;
}

export class CloseCashSessionDTO {
  @IsNumber()
  @Min(0)
  closingAmountDeclared!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateCashMovementDTO {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsOptional()
  description?: string;
}

// ============================================================
// CASH DTOs — Output
// ============================================================

export interface CashMovementDTO {
  id: string;
  type: CashMovementType;
  amount: number;
  paymentMethod?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  description?: string | null;
  createdAt: string;
}

export interface CashSessionDTO {
  id: string;
  tenantId: string;
  operatorId: string;
  operatorName: string;
  status: CashSessionStatus;
  openingAmount: number;
  openedAt: string;
  closedAt?: string | null;
  closingAmountDeclared?: number | null;
  closingAmountCalculated?: number | null;
  closingDifference?: number | null;
  notes?: string | null;
}

export interface CashSessionDetailDTO extends CashSessionDTO {
  movements: CashMovementDTO[];
  totalSales: number;
  totalCash: number;
  totalPix: number;
  totalCreditCard: number;
  totalDebitCard: number;
  totalOther: number;
  totalWithdrawals: number;
  totalSupplies: number;
  totalRefunds: number;
  expectedAmount: number;
}
