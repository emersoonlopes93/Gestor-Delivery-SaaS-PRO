import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class UpdateProductOptionItemOverrideDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  price?: number;
}
