import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  CustomerGoogleLinkRequest,
  CustomerGoogleSignInRequest,
  CustomerGoogleSignInResponse,
  CustomerJwtPayload,
  CustomerLoginResponse,
  CustomerRefreshTokenRequest,
  SendOtpRequest,
} from '@gestor/types';
import type { Request } from 'express';
import { CurrentCustomer, Public } from '../common/decorators';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerSessionService } from './customer-session.service';
import { CustomerAuthGuard } from './guards/customer-auth.guard';

@Controller('public/auth/:tenantSlug/otp')
export class CustomerAuthController {
  constructor(
    private readonly authService: CustomerAuthService,
    private readonly customerSessionService: CustomerSessionService,
  ) {}

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60 } })
  @Post('send')
  @HttpCode(HttpStatus.OK)
  sendOtp(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: SendOtpRequest,
  ) {
    return this.authService.sendOtp(body.phone, tenantSlug);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  validateOtp(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: CustomerGoogleLinkRequest,
    @Req() req: Request,
  ): Promise<CustomerLoginResponse> {
    return this.authService.validateOtp(
      body.phone,
      body.code,
      tenantSlug,
      body.googleLinkCapability,
      sessionContext(req),
    );
  }

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60 } })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  googleSignIn(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: CustomerGoogleSignInRequest,
    @Req() req: Request,
  ): Promise<CustomerGoogleSignInResponse> {
    return this.authService.signInWithGoogle(body.credential, tenantSlug, sessionContext(req));
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: CustomerRefreshTokenRequest,
    @Req() req: Request,
  ): Promise<CustomerLoginResponse> {
    const tenantId = await this.authService.resolveTenantId(tenantSlug);
    return this.customerSessionService.refresh(body.refreshToken, tenantId, sessionContext(req));
  }

  @UseGuards(CustomerAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Param('tenantSlug') tenantSlug: string,
    @CurrentCustomer() customer: CustomerJwtPayload,
  ) {
    await this.assertTenant(tenantSlug, customer.tenantId);
    return this.customerSessionService.logout(customer.sid);
  }

  @UseGuards(CustomerAuthGuard)
  @Get('me')
  async me(
    @Param('tenantSlug') tenantSlug: string,
    @CurrentCustomer() customer: CustomerJwtPayload,
  ) {
    await this.assertTenant(tenantSlug, customer.tenantId);
    return this.customerSessionService.getCurrent(customer.sub, customer.tenantId);
  }

  private async assertTenant(tenantSlug: string, expectedTenantId: string): Promise<void> {
    const tenantId = await this.authService.resolveTenantId(tenantSlug);
    if (tenantId !== expectedTenantId) throw new UnauthorizedException('Invalid customer tenant');
  }
}

function sessionContext(req: Request) {
  return {
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
  };
}
