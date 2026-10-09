import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { CategoryActiveDay, CreateCategoryDto as ICreateCategoryDto } from '@gestor/types';

const CATEGORY_ACTIVE_DAYS: CategoryActiveDay[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsIn(CATEGORY_ACTIVE_DAYS, { each: true })
  activeDays?: CategoryActiveDay[];

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
  templateConfig?: Record<string, unknown>;
}
