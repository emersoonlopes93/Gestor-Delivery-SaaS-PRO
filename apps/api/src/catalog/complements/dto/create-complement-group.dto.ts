import { IsString, IsOptional, IsBoolean, IsNumber, IsInt } from 'class-validator';
import { CreateProductComplementGroupDto as ICreateProductComplementGroupDto } from '@gestor/types';

export class CreateComplementGroupDto implements ICreateProductComplementGroupDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  minSelect?: number;

  @IsInt()
  @IsOptional()
  maxSelect?: number;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @IsOptional()
  order?: number;
}
