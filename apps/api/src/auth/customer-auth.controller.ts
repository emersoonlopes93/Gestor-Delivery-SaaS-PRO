import { Controller, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CustomerAuthService } from './customer-auth.service';
import { Public } from '../common/decorators';
import { SendOtpRequest, ValidateOtpRequest, CustomerLoginResponse } from '@gestor/types';

@Public()
@Controller('public/auth/:tenantSlug/otp')
export class CustomerAuthController {
  constructor(private readonly authService: CustomerAuthService) {}

  @Throttle({ auth: { limit: 5, ttl: 60 } }) // More restrictive for auth
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: SendOtpRequest,
  ) {
    return this.authService.sendOtp(body.phone, tenantSlug);
  }

  @Throttle({ auth: { limit: 10, ttl: 60 } })
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateOtp(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: ValidateOtpRequest,
  ): Promise<CustomerLoginResponse> {
    return this.authService.validateOtp(body.phone, body.code, tenantSlug);
  }
}
