import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateProductOptionGroupLinkDto {
  @IsString()
  productId!: string;

  @IsString()
  optionGroupId!: string;

  @IsNumber()
  @IsOptional()
  order?: number;

  @IsString()
  @IsOptional()
  overrideName?: string;

  @IsString()
  @IsOptional()
  overrideDescription?: string;

  @IsBoolean()
  @IsOptional()
  overrideIsRequired?: boolean;

  @IsNumber()
  @IsOptional()
  overrideMinSelect?: number;

  @IsNumber()
  @IsOptional()
  overrideMaxSelect?: number;

  @IsEnum(['primary', 'secondary'])
  @IsOptional()
  pricingAxis?: 'primary' | 'secondary';
}
