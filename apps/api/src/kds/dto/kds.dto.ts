import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, IsArray } from 'class-validator';
import { PrintJobStatus } from '@prisma/client';

export class CreatePrintJobDTO {
  @IsString() @IsNotEmpty()
  orderId!: string;

  @IsString() @IsNotEmpty()
  station!: string;

  @IsString() @IsNotEmpty()
  content!: string;

  @IsString() @IsOptional()
  printerName?: string;

  @IsNumber() @IsOptional()
  copies?: number;

  @IsNumber() @IsOptional()
  priority?: number;
}

export class CreateIncrementalPrintJobDTO {
  @IsString() @IsNotEmpty()
  orderId!: string;

  @IsString() @IsNotEmpty()
  station!: string;

  @IsNumber() @IsNotEmpty()
  sequenceNumber!: number;

  @IsString() @IsNotEmpty()
  content!: string;

  @IsString() @IsOptional()
  parentPrintJobId?: string;

  @IsNumber() @IsOptional()
  priority?: number;
}

export class CreateMultipleIncrementalPrintJobsDTO {
  @IsString() @IsNotEmpty()
  orderId!: string;

  @IsString() @IsNotEmpty()
  station!: string;

  @IsArray() @IsNotEmpty()
  items!: Array<{
    sequenceNumber: number;
    content: string;
    metadata?: Record<string, unknown>;
  }>;

  @IsString() @IsOptional()
  parentPrintJobId?: string;

  @IsNumber() @IsOptional()
  priority?: number;
}

export class UpdatePrintJobStatusDTO {
  @IsEnum(PrintJobStatus)
  status!: PrintJobStatus;

  @IsString() @IsOptional()
  error?: string;
}

export class ReprintPrintJobDTO {
  @IsString() @IsNotEmpty()
  printJobId!: string;
}

export class CancelPrintJobDTO {
  @IsString() @IsNotEmpty()
  printJobId!: string;
}

export class CleanupPrintJobsDTO {
  @IsNumber() @IsOptional()
  daysOld?: number;
}

export class GetPrintJobsQueryDTO {
  @IsString() @IsOptional()
  station?: string;

  @IsEnum(PrintJobStatus)
  @IsOptional()
  status?: PrintJobStatus;

  @IsNumber() @IsOptional()
  page?: number;

  @IsNumber() @IsOptional()
  limit?: number;
}

export class PrintJobQueryDTO {
  @IsString() @IsOptional()
  station?: string;

  @IsNumber() @IsOptional()
  limit?: number;
}
