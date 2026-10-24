import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class ContextualOptionItemDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsEnum(['none', 'fixed', 'replace', 'percentage']) priceImpactType?: 'none' | 'fixed' | 'replace' | 'percentage';
  @IsOptional() @IsNumber() priceImpactValue?: number;
  @IsOptional() @IsBoolean() allowQuantity?: boolean;
  @IsOptional() @IsInt() minQty?: number | null;
  @IsOptional() @IsInt() maxQty?: number | null;
  @IsOptional() @IsBoolean() productIsActive?: boolean;
}

export class CreateContextualOptionGroupDto {
  @IsString() @MaxLength(100) idempotencyKey!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(['single', 'multiple', 'quantity']) selectionType!: 'single' | 'multiple' | 'quantity';
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsInt() minSelect?: number;
  @IsOptional() @IsInt() maxSelect?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsEnum(['primary', 'secondary']) pricingAxis!: 'primary' | 'secondary';
  @IsOptional() @IsString() overrideName?: string;
  @IsOptional() @IsString() overrideDescription?: string;
  @IsOptional() @IsBoolean() overrideIsRequired?: boolean;
  @IsOptional() @IsInt() overrideMinSelect?: number;
  @IsOptional() @IsInt() overrideMaxSelect?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ContextualOptionItemDto) items!: ContextualOptionItemDto[];
}
