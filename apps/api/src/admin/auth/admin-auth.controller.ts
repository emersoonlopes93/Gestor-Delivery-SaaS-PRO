import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { TenantAuthService } from '../../auth/tenant-auth.service';

class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

class AdminRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

@Controller('auth/admin')
export class AdminAuthController {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly tenantAuthService: TenantAuthService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: AdminLoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: AdminRefreshDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @UseGuards(AdminAuthGuard)
  @Get('me')
  async me(@CurrentUser('sub') userId: string) {
    return this.authService.getSession(userId);
  }

  @UseGuards(AdminAuthGuard)
  @Post('impersonate')
  async impersonate(
    @CurrentUser('sub') adminId: string,
    @Body() body: { tenantId: string; reason: string },
  ) {
    return this.tenantAuthService.impersonate(body.tenantId, adminId, body.reason);
  }
}
