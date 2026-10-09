import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateOrderAutoAcceptSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoAcceptOrdersEnabled?: boolean;

  @IsOptional()
  @IsIn([0, 30, 60])
  autoAcceptDelaySeconds?: 0 | 30 | 60;

  @IsOptional()
  @IsBoolean()
  autoAcceptDeliveryOrders?: boolean;

  @IsOptional()
  @IsBoolean()
  autoAcceptPickupOrders?: boolean;
}
