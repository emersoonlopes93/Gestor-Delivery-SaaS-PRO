import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateComboSlotAllowedItemDto {
  @IsString()
  comboSlotId!: string;

  @IsString()
  productId!: string;

  @IsNumber()
  @IsOptional()
  additionalPrice?: number;

  @IsNumber()
  @IsOptional()
  order?: number;
}
