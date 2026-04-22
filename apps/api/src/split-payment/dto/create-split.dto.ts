import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, IsArray } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateOrderSplitDTO {
  @IsString() @IsNotEmpty()
  orderId!: string;

  @IsEnum(['items', 'people', 'custom'])
  splitType!: 'items' | 'people' | 'custom';

  @IsString() @IsOptional()
  description?: string;

  @IsNumber() @IsNotEmpty()
  subtotalAmount!: number;

  @IsNumber() @IsOptional()
  discountAmount?: number;

  @IsNumber() @IsOptional()
  serviceFeeAmount?: number;

  @IsNumber() @IsOptional()
  deliveryFeeAmount?: number;

  @IsNumber() @IsNotEmpty()
  totalAmount!: number;

  @IsString() @IsOptional()
  responsiblePerson?: string;

  @IsString() @IsOptional()
  responsiblePhone?: string;

  @IsString() @IsOptional()
  notes?: string;
}

export class AddPaymentToSplitDTO {
  @IsString() @IsNotEmpty()
  orderSplitId!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsNumber() @IsNotEmpty()
  amount!: number;

  @IsNumber() @IsOptional()
  changeFor?: number;

  @IsString() @IsOptional()
  notes?: string;
}

export class UpdateOrderSplitDTO {
  @IsString() @IsOptional()
  description?: string;

  @IsString() @IsOptional()
  responsiblePerson?: string;

  @IsString() @IsOptional()
  responsiblePhone?: string;

  @IsString() @IsOptional()
  notes?: string;
}

export class CancelOrderSplitDTO {
  @IsString() @IsOptional()
  reason?: string;
}

export class ConfirmPaymentDTO {
  @IsString() @IsNotEmpty()
  splitPaymentId!: string;
}

export class SplitByItemsDTO {
  @IsString() @IsNotEmpty()
  orderId!: string;

  @IsArray() @IsNotEmpty()
  items!: Array<{
    orderItemId: string;
    quantity: number;
    splitDescription?: string;
  }>;

  @IsString() @IsOptional()
  responsiblePerson?: string;

  @IsString() @IsOptional()
  responsiblePhone?: string;
}

export class SplitByPeopleDTO {
  @IsString() @IsNotEmpty()
  orderId!: string;

  @IsNumber() @IsNotEmpty()
  numberOfPeople!: number;

  @IsString() @IsOptional()
  splitType?: 'equal' | 'custom';

  @IsArray() @IsOptional()
  peopleSplits?: Array<{
    personName: string;
    personPhone?: string;
    amount: number;
  }>;
}

export class CustomSplitDTO {
  @IsString() @IsNotEmpty()
  orderId!: string;

  @IsArray() @IsNotEmpty()
  splits!: Array<{
    description: string;
    subtotalAmount: number;
    discountAmount?: number;
    serviceFeeAmount?: number;
    deliveryFeeAmount?: number;
    totalAmount: number;
    responsiblePerson?: string;
    responsiblePhone?: string;
    notes?: string;
  }>;
}
