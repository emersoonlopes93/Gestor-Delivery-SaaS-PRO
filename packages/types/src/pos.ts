import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDTO } from './order';

// ============================================================
// POS ENUMS
// ============================================================

import { PaymentMethod } from './enums';

export enum PosFulfillmentType {
  DINE_IN = 'dine_in',
  PICKUP = 'pickup',
  DELIVERY = 'delivery',
  TABLE = 'table',
}

// ============================================================
// POS DTOs — Input
// ============================================================

export class CreatePosOrderDTO {
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsArray()
  @IsNotEmpty({ message: 'Items cannot be empty' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDTO)
  items!: CreateOrderItemDTO[];

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsEnum(PosFulfillmentType)
  fulfillmentType!: PosFulfillmentType;

  @IsString()
  @IsOptional()
  tableNumber?: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discountTotal?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  couponCode?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  useCashbackAmount?: number;
}

// ============================================================
// POS DTOs — Output
// ============================================================

export interface PosOrderListItemDTO {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentType: string;
  customerName: string;
  paymentMethod: string;
  total: number;
  discountTotal: number;
  sourceChannel: string;
  createdAt: string;
}
