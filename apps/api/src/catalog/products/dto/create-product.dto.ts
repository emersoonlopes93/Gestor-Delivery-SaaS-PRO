import { IsString, IsOptional, IsBoolean, IsNumber, IsDecimal } from 'class-validator';
import { CreateProductDto as ICreateProductDto } from '@gestor/types';

export class CreateProductDto implements ICreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsOptional()
  @IsString()
  type?: 'simple' | 'configurable' | 'combo';

  @IsString()
  @IsOptional()
  shortDescription?: string;

  @IsString()
  @IsOptional()
  longDescription?: string;

  @IsNumber()
  basePrice!: number;

  @IsString()
  @IsOptional()
  image?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @IsBoolean()
  @IsOptional()
  sellableOnline?: boolean;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsOptional()
  optionItemPrices?: { optionItemId: string, price: number }[];
}
