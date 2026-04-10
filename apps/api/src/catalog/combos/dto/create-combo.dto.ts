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
