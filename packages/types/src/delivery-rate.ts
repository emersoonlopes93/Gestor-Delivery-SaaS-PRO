import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export type DeliveryRateRuleType = 'neighborhood' | 'distance' | 'fixed' | 'polygon';
export type DeliveryZoneKind = 'blocked_zone' | 'custom_zone';
export type DeliveryPricingMode = 'fixed' | 'distance' | 'free' | 'tiers';

/** Payload de faixa de distância aceito pelo service (números já normalizados). */
export interface DeliveryRateDistanceTierInput {
  id?: string;
  minDistanceKm: number;
  maxDistanceKm: number;
  fee: number;
  estimatedDeliveryMinutes?: number;
  sortOrder?: number;
}

export class DeliveryRateDistanceTierDTO {
  @IsOptional()
  @IsString()
  id?: string;

  @IsNumber()
  minDistanceKm!: number;

  @IsNumber()
  maxDistanceKm!: number;

  @IsNumber()
  fee!: number;

  @IsOptional()
  @IsNumber()
  estimatedDeliveryMinutes?: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateDeliveryRateRuleDTO {
  @IsEnum(['neighborhood', 'distance', 'fixed', 'polygon'])
  type!: DeliveryRateRuleType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string;

  @IsOptional()
  @IsEnum(['blocked_zone', 'custom_zone'])
  zoneKind?: DeliveryZoneKind;

  @IsOptional()
  @IsEnum(['fixed', 'distance', 'free', 'tiers'])
  pricingMode?: DeliveryPricingMode;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryRateDistanceTierDTO)
  distanceTiers?: DeliveryRateDistanceTierDTO[];

  @IsOptional()
  @IsNumber()
  estimatedDeliveryMinutes?: number;

  @IsOptional()
  @IsBoolean()
  blocksDelivery?: boolean;

  @IsOptional()
  @IsNumber()
  fixedFee?: number;

  @IsOptional()
  @IsNumber()
  pricePerKm?: number;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isFallback?: boolean;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsNumber()
  minKm?: number;

  @IsOptional()
  @IsNumber()
  maxKm?: number;

  @IsOptional()
  @IsNumber()
  minDistanceKm?: number;

  @IsOptional()
  @IsNumber()
  maxDistanceKm?: number;

  @IsOptional()
  @IsNumber()
  ratePerKm?: number;

  @IsOptional()
  @IsNumber()
  fixedRate?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  geoJson?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  polygonCoordinates?: unknown[];
}

/** Entrada do `DeliveryRateService.upsertRule` (sem dependência de Prisma). */
export interface UpsertDeliveryRateRuleInput {
  id?: string;
  type: DeliveryRateRuleType;
  neighborhood?: string;
  rate?: number;
  minKm?: number;
  maxKm?: number;
  ratePerKm?: number;
  fixedRate?: number;
  isActive?: boolean;
  priority?: number;
  isFallback?: boolean;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  geoJson?: unknown;
  polygonCoordinates?: unknown;
  name?: string;
  color?: string;
  zoneKind?: DeliveryZoneKind;
  pricingMode?: DeliveryPricingMode;
  blocksDelivery?: boolean;
  fixedFee?: number;
  pricePerKm?: number;
  estimatedDeliveryMinutes?: number;
  distanceTiers?: DeliveryRateDistanceTierInput[];
}
