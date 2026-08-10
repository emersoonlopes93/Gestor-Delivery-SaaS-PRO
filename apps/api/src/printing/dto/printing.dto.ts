import { IsString, IsOptional, IsBoolean, IsNumber, IsUUID } from 'class-validator';

export class CreatePrinterDeviceDto {
  @IsOptional()
  @IsString()
  stationId?: string | null;

  @IsString()
  name: string;

  @IsString()
  connectionType: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  paperWidth?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  autoPrintEnabled?: boolean;
}

export class UpdatePrinterDeviceDto {
  @IsOptional()
  @IsString()
  stationId?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  connectionType?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  vendor?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  paperWidth?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsBoolean()
  autoPrintEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AckSpoolerJobDto {
  @IsString()
  printerDeviceId: string;
}

export class FailSpoolerJobDto {
  @IsString()
  printerDeviceId: string;

  @IsString()
  errorMessage: string;
}

export class CreateTestPrintDto {
  @IsString()
  stationSlug: string;

  @IsString()
  deviceName: string;

  @IsOptional()
  @IsUUID()
  requestId?: string;
}
