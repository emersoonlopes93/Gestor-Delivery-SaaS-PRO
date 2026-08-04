import { Controller, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CustomerAuthService } from './customer-auth.service';
import { Public } from '../common/decorators';
import {
  CustomerGoogleLinkRequest,
  CustomerGoogleSignInRequest,
  CustomerGoogleSignInResponse,
  CustomerLoginResponse,
  SendOtpRequest,
} from '@gestor/types';

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
    @Body() body: CustomerGoogleLinkRequest,
  ): Promise<CustomerLoginResponse> {
    return this.authService.validateOtp(body.phone, body.code, tenantSlug, body.googleLinkCapability);
  }

  @Throttle({ auth: { limit: 5, ttl: 60 } })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleSignIn(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: CustomerGoogleSignInRequest,
  ): Promise<CustomerGoogleSignInResponse> {
    return this.authService.signInWithGoogle(body.credential, tenantSlug);
  }
}
