import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreatePrinterDeviceDto {
  @IsString()
  stationId: string;

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
