import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateOptionItemDto {
  @IsString()
  @IsOptional()
  optionGroupId?: string;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsEnum(['none', 'fixed', 'replace', 'percentage'])
  @IsOptional()
  priceImpactType?: 'none' | 'fixed' | 'replace' | 'percentage';

  @IsNumber()
  @IsOptional()
  priceImpactValue?: number;

  @IsBoolean()
  @IsOptional()
  allowQuantity?: boolean;

  @IsNumber()
  @IsOptional()
  minQty?: number;

  @IsNumber()
  @IsOptional()
  maxQty?: number;
}
