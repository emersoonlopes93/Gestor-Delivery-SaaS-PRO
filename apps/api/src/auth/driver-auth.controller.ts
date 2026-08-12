import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { DriverLoginRequest, DriverTenantSelectionRequest, RefreshTokenRequest } from '@gestor/types';
import { DriverAuthGuard } from './guards/driver-auth.guard';
import { DriverAuthService } from './driver-auth.service';

@Controller('auth/driver')
export class DriverAuthController {
  constructor(private readonly driverAuthService: DriverAuthService) {}

  @Post('login')
  @Throttle({ auth: { limit: 5, ttl: 60 } })
  async login(@Body() body: DriverLoginRequest, @Req() req: Request) {
    return this.driverAuthService.login(body.phone, body.pin, body.tenantSlug, sessionContext(req));
  }

  @Post('select-tenant')
  @Throttle({ auth: { limit: 5, ttl: 60 } })
  async selectTenant(@Body() body: DriverTenantSelectionRequest, @Req() req: Request) {
    return this.driverAuthService.selectTenant(body.selectionToken, body.driverId, sessionContext(req));
  }

  @Post('refresh')
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  async refresh(@Body() body: RefreshTokenRequest, @Req() req: Request) {
    return this.driverAuthService.refreshToken(body.refreshToken, sessionContext(req));
  }

  @Get('me')
  @UseGuards(DriverAuthGuard)
  async me(@Req() req: Request) {
    const user = req.user as { sub: string };
    return this.driverAuthService.getSession(user.sub);
  }

  @Post('logout')
  @UseGuards(DriverAuthGuard)
  async logout(@Req() req: Request) {
    const user = req.user as { sub: string; tenantId: string; sid?: string };
    return this.driverAuthService.logout(user.sub, user.tenantId, user.sid);
  }

  @Post('logout-global')
  @UseGuards(DriverAuthGuard)
  async logoutGlobal(@Req() req: Request) {
    const user = req.user as { sub: string; tenantId: string };
    return this.driverAuthService.logoutGlobal(user.sub, user.tenantId);
  }

  @Get('sessions')
  @UseGuards(DriverAuthGuard)
  async sessions(@Req() req: Request) {
    const user = req.user as { sub: string };
    return this.driverAuthService.listSessions(user.sub);
  }
}

function sessionContext(req: Request) {
  return {
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
  };
}
