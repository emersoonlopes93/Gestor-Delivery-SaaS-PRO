import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TenantAuthService } from './tenant-auth.service';
import { CurrentUser, Public } from '../common/decorators';
import { TenantAuthGuard } from './guards/tenant-auth.guard';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsOptional()
  tenantSlug?: string;
}

class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

class RegisterDto {
  @IsString()
  @IsNotEmpty()
  ownerName!: string;

  @IsString()
  @IsNotEmpty()
  shopName!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

class SwitchTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}

@Controller('auth/tenant')
export class TenantAuthController {
  constructor(private readonly authService: TenantAuthService) {}

  @Public()
  @Post('login')
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.email, dto.password, dto.tenantSlug, sessionContext(req));
  }

  @Public()
  @Post('register')
  @Throttle({ auth: { limit: 5, ttl: 300 } }) // Limite de 5 registros a cada 5 minutos
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(
      dto.ownerName,
      dto.shopName,
      dto.phone,
      dto.email,
      dto.password,
      sessionContext(req),
    );
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ auth: { limit: 3, ttl: 300 } }) // Limite de 3 solicitações a cada 5 minutos
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ auth: { limit: 3, ttl: 300 } }) 
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Post('refresh')
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.refreshToken(dto.refreshToken, sessionContext(req));
  }

  @UseGuards(TenantAuthGuard)
  @Get('me')
  async me(@CurrentUser('sub') userId: string) {
    return this.authService.getSession(userId);
  }

  @UseGuards(TenantAuthGuard)
  @Post('switch-store')
  async switchStore(
    @CurrentUser('sub') userId: string,
    @Body() dto: SwitchTenantDto,
    @Req() req: Request,
  ) {
    return this.authService.switchTenant(userId, dto.tenantId, sessionContext(req));
  }

  @UseGuards(TenantAuthGuard)
  @Post('logout')
  async logout(@CurrentUser('sid') sessionId?: string) {
    return this.authService.logout(sessionId);
  }

  @UseGuards(TenantAuthGuard)
  @Post('logout-global')
  async logoutGlobal(@CurrentUser('sub') userId: string) {
    return this.authService.logoutGlobal(userId);
  }

  @UseGuards(TenantAuthGuard)
  @Get('sessions')
  async sessions(@CurrentUser('sub') userId: string) {
    return this.authService.listSessions(userId);
  }
}

function sessionContext(req: Request) {
  return {
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
  };
}
