import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TenantAuthService } from './tenant-auth.service';
import { CurrentUser, Public } from '../common/decorators';
import { TenantAuthGuard } from './guards/tenant-auth.guard';
import { Throttle } from '@nestjs/throttler';

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

@Controller('auth/tenant')
export class TenantAuthController {
  constructor(private readonly authService: TenantAuthService) {}

  @Public()
  @Post('login')
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password, dto.tenantSlug);
  }

  @Public()
  @Post('register')
  @Throttle({ auth: { limit: 5, ttl: 300 } }) // Limite de 5 registros a cada 5 minutos
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(
      dto.ownerName,
      dto.shopName,
      dto.phone,
      dto.email,
      dto.password,
    );
  }

  @Public()
  @Post('refresh')
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @UseGuards(TenantAuthGuard)
  @Get('me')
  async me(@CurrentUser('sub') userId: string) {
    return this.authService.getSession(userId);
  }
}
