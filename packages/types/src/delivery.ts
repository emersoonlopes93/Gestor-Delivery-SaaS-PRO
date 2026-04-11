import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { DriverStatus, DriverVehicleType } from './enums';

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

export interface DriverDTO {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  isActive: boolean;
  status: DriverStatus;
  vehicleType: DriverVehicleType;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}
