import { Controller, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';
import { Public } from '../common/decorators';
import { SendOtpRequest, ValidateOtpRequest, CustomerLoginResponse } from '@gestor/types';

@Public()
@Controller('public/auth/:tenantSlug/otp')
export class CustomerAuthController {
  constructor(private readonly authService: CustomerAuthService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: SendOtpRequest,
  ) {
    return this.authService.sendOtp(body.phone, tenantSlug);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateOtp(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: ValidateOtpRequest,
  ): Promise<CustomerLoginResponse> {
    return this.authService.validateOtp(body.phone, body.code, tenantSlug);
  }
}
