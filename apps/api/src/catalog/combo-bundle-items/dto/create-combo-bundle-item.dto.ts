import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateComboBundleItemDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

