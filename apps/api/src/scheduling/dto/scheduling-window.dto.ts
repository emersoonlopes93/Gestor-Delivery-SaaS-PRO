import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min, Max } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateSchedulingWindowDTO {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateSchedulingWindowDTO extends PartialType(CreateSchedulingWindowDTO) {}
