import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { CurrentUser, Public, RequireAdminPermissions } from '../../common/decorators';
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
  @Throttle({ auth: { limit: 5, ttl: 60 } })
  @Post('login')
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.authService.login(dto.email, dto.password, sessionContext(req));
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  @Post('refresh')
  async refresh(@Body() dto: AdminRefreshDto, @Req() req: Request) {
    return this.authService.refreshToken(dto.refreshToken, sessionContext(req));
  }

  @UseGuards(AdminAuthGuard)
  @Get('me')
  async me(@CurrentUser('sub') userId: string) {
    return this.authService.getSession(userId);
  }

  @UseGuards(AdminAuthGuard)
  @Post('logout')
  async logout(@CurrentUser('sid') sessionId?: string) {
    return this.authService.logout(sessionId);
  }

  @UseGuards(AdminAuthGuard)
  @Post('logout-global')
  async logoutGlobal(@CurrentUser('sub') userId: string) {
    return this.authService.logoutGlobal(userId);
  }

  @UseGuards(AdminAuthGuard)
  @Get('sessions')
  async sessions(@CurrentUser('sub') userId: string) {
    return this.authService.listSessions(userId);
  }

  @UseGuards(AdminAuthGuard, AdminPermissionsGuard)
  @RequireAdminPermissions('saas.support.impersonate')
  @Post('impersonate')
  async impersonate(
    @CurrentUser('sub') adminId: string,
    @Body() body: { tenantId: string; reason: string },
  ) {
    return this.tenantAuthService.impersonate(body.tenantId, adminId, body.reason);
  }
}

function sessionContext(req: Request) {
  return {
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
  };
}
