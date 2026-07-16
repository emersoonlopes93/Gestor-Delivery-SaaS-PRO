import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TimeSlotStatus } from '@prisma/client';

export class CreateScheduledOrderDTO {
  @IsString() @IsNotEmpty()
  customerId!: string;

  @IsDateString() @IsNotEmpty()
  scheduledFor!: string;

  @IsString() @IsNotEmpty()
  timeSlotId!: string;

  @IsNumber() @IsNotEmpty()
  estimatedDuration!: number; // em minutos

  @IsString() @IsOptional()
  notes?: string;
}

export class CreateTimeSlotDTO {
  @IsDateString() @IsNotEmpty()
  startTime!: string;

  @IsDateString() @IsNotEmpty()
  endTime!: string;

  @IsNumber() @IsOptional()
  capacity?: number;

  @IsNumber() @IsOptional()
  minOrderValue?: number;

  @IsNumber() @IsOptional()
  maxOrderValue?: number;

  @IsNumber() @IsOptional()
  maxItems?: number;

  @IsString() @IsOptional()
  recurrencePattern?: string; // daily, weekly, monthly

  @IsDateString() @IsOptional()
  recurrenceEnd?: string;
}

export class UpdateScheduledOrderDTO {
  @IsDateString() @IsOptional()
  scheduledFor?: string;

  @IsNumber() @IsOptional()
  estimatedDuration?: number;

  @IsString() @IsOptional()
  notes?: string;

  @IsString() @IsOptional()
  timeSlotId?: string;
}

export class CancelScheduledOrderDTO {
  @IsString() @IsOptional()
  reason?: string;
}

export class UpdateTimeSlotDTO {
  @IsDateString() @IsOptional()
  startTime?: string;

  @IsDateString() @IsOptional()
  endTime?: string;

  @IsInt() @Min(1) @IsOptional()
  capacity?: number;

  @IsNumber() @IsOptional()
  minOrderValue?: number;

  @IsNumber() @IsOptional()
  maxOrderValue?: number;

  @IsInt() @Min(1) @IsOptional()
  maxItems?: number;

  @IsEnum(TimeSlotStatus) @IsOptional()
  status?: TimeSlotStatus;

  @IsBoolean() @IsOptional()
  isActive?: boolean;
}
