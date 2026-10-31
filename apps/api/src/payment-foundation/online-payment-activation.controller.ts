import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant, CurrentUser, RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { OnlinePaymentActivationService } from './online-payment-activation.service';

class RequestOnlinePaymentActivationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  termsVersion!: string;
}

@Controller('payment-foundation/activation')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class OnlinePaymentActivationController {
  constructor(private readonly service: OnlinePaymentActivationService) {}

  @Get()
  @RequirePermissions('billing.read')
  getStatus(@CurrentTenant() tenantId: string) {
    return this.service.getStatus(tenantId);
  }

  @Post('request')
  @RequirePermissions('billing.write')
  requestActivation(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') actorUserId: string,
    @Body() dto: RequestOnlinePaymentActivationDto,
  ) {
    return this.service.requestActivation({ tenantId, actorUserId, termsVersion: dto.termsVersion });
  }
}
