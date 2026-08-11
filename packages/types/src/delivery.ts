import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { DriverStatus, DriverVehicleType } from './enums';

export enum DriverShiftStatus {
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export enum DeliveryRunStatus {
  PENDING_ACCEPTANCE = 'PENDING_ACCEPTANCE',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  RETURNING = 'RETURNING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum DeliveryStopStatus {
  PENDING = 'PENDING',
  CURRENT = 'CURRENT',
  ARRIVED = 'ARRIVED',
  DELIVERED = 'DELIVERED',
  FAILED_ATTEMPT = 'FAILED_ATTEMPT',
  RETURN_TO_STORE = 'RETURN_TO_STORE',
  RETURNED_TO_STORE = 'RETURNED_TO_STORE',
  CANCELLED = 'CANCELLED',
}

export const ACTIVE_DELIVERY_RUN_STATUSES: readonly DeliveryRunStatus[] = [
  DeliveryRunStatus.PENDING_ACCEPTANCE,
  DeliveryRunStatus.ASSIGNED,
  DeliveryRunStatus.IN_PROGRESS,
  DeliveryRunStatus.RETURNING,
];

export const OPEN_DELIVERY_STOP_STATUSES: readonly DeliveryStopStatus[] = [
  DeliveryStopStatus.PENDING,
  DeliveryStopStatus.CURRENT,
  DeliveryStopStatus.ARRIVED,
  DeliveryStopStatus.FAILED_ATTEMPT,
  DeliveryStopStatus.RETURN_TO_STORE,
];

export class CreateDeliveryRunDTO {
  @IsString()
  driverId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  orderIds!: string[];
}

export class ReorderDeliveryStopsDTO {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  stopIds!: string[];
}

export class DeliveryRunReasonDTO {
  @IsString()
  @MaxLength(255)
  reason!: string;
}

export class CreateDriverDTO {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(20)
  phone!: string;

  @IsEnum(DriverVehicleType)
  @IsOptional()
  vehicleType?: DriverVehicleType;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateDriverDTO {
  @IsString()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEnum(DriverStatus)
  @IsOptional()
  status?: DriverStatus;

  @IsEnum(DriverVehicleType)
  @IsOptional()
  vehicleType?: DriverVehicleType;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateDriverOperationalStatusDTO {
  @IsIn([DriverStatus.available, DriverStatus.offline])
  status!: DriverStatus.available | DriverStatus.offline;
}

export interface DriverDTO {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  isActive: boolean;
  status: DriverStatus;
  vehicleType: DriverVehicleType;
  notes?: string | null;
  currentLat?: number | null;
  currentLng?: number | null;
  lastLocationAt?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  pin?: string; // Temporário para exibir uma vez após criação/reset
}
