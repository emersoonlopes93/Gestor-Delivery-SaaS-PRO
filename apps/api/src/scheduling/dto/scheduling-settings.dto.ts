import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSchedulingSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  acceptScheduledOrders?: boolean;

  @IsBoolean()
  @IsOptional()
  allowScheduleWhenClosed?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  minimumAdvanceMinutes?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maximumAdvanceDays?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  slotIntervalMinutes?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxOrdersPerSlot?: number;

  @IsString()
  @IsOptional()
  timezone?: string;
}
