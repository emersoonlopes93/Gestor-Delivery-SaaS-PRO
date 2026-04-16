import { IsString, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { CreateCategoryDto as ICreateCategoryDto } from '@gestor/types';

export class CreateCategoryDto implements ICreateCategoryDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsInt()
  @IsOptional()
  order?: number;

  @IsOptional()
  @IsString()
  templateType?: 'none' | 'pizza';

  @IsOptional()
  templateConfig?: any;
}
