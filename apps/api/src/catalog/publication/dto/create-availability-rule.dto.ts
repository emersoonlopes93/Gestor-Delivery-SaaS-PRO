import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAvailabilityRuleDto {
  @IsEnum(['storefront_delivery', 'storefront_pickup', 'pos'])
  channel!: 'storefront_delivery' | 'storefront_pickup' | 'pos';

  @IsArray()
  @IsNotEmpty()
  daysOfWeek!: number[];

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
