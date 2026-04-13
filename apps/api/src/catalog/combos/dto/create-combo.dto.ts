import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { CreateProductComboDto as ICreateProductComboDto } from '@gestor/types';

export class CreateComboDto implements ICreateProductComboDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

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

  @IsNumber()
  @IsOptional()
  order?: number;
}

export class CreateComboBlockDto {
  @IsString()
  comboId!: string;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  minSelect?: number;

  @IsNumber()
  @IsOptional()
  maxSelect?: number;

  @IsNumber()
  @IsOptional()
  order?: number;
}

export class CreateComboBlockItemDto {
  @IsString()
  blockId!: string;

  @IsString()
  productId!: string;

  @IsNumber()
  @IsOptional()
  additionalPrice?: number;

  @IsNumber()
  @IsOptional()
  order?: number;
}
