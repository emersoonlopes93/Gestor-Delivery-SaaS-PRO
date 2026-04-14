import { IsArray, IsLatitude, IsLongitude, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RouteOptimizationOrderInputDTO {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}

export class RouteOptimizationDriverInputDTO {
  @IsString()
  driverId!: string;

  @IsOptional()
  @IsLatitude()
  currentLat?: number;

  @IsOptional()
  @IsLongitude()
  currentLng?: number;
}

export class RouteOptimizationInputDTO {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteOptimizationOrderInputDTO)
  orders!: RouteOptimizationOrderInputDTO[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteOptimizationDriverInputDTO)
  drivers!: RouteOptimizationDriverInputDTO[];
}
