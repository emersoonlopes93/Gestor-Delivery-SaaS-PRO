import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateComboBundleItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

