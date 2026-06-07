import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { FractionalPricingRule } from '@prisma/client';

export class CreateOptionGroupDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['single', 'multiple', 'quantity'])
  selectionType!: 'single' | 'multiple' | 'quantity';

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsNumber()
  @IsOptional()
  minSelect?: number;

  @IsNumber()
  @IsOptional()
  maxSelect?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsEnum(FractionalPricingRule)
  @IsOptional()
  fractionalPricingRule?: FractionalPricingRule;
}

