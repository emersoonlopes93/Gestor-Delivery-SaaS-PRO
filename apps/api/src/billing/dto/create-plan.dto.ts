import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BillingCycle } from '@prisma/client';

export class CreatePlanDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsNumber()
  price!: number;

  @IsEnum(BillingCycle)
  @IsOptional()
  billingCycle?: BillingCycle;

  @IsObject()
  @IsOptional()
  features?: Record<string, boolean>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdatePlanDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsEnum(BillingCycle)
  @IsOptional()
  billingCycle?: BillingCycle;

  @IsObject()
  @IsOptional()
  features?: Record<string, boolean>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateSubscriptionDto {
  @IsString()
  tenantId!: string;

  @IsString()
  planId!: string;
}

export class UpdateSubscriptionDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  planId?: string;
}
