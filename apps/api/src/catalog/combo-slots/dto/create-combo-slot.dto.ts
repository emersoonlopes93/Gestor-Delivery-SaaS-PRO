import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateComboSlotDto {
  @IsString()
  comboProductId!: string;

  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

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
