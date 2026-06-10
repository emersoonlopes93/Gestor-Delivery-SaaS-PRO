import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { DriverLoginRequest, RefreshTokenRequest } from '@gestor/types';
import { DriverAuthGuard } from './guards/driver-auth.guard';
import { DriverAuthService } from './driver-auth.service';

@Controller('auth/driver')
export class DriverAuthController {
  constructor(private readonly driverAuthService: DriverAuthService) {}

  @Post('login')
  async login(@Body() body: DriverLoginRequest, @Req() req: Request) {
    return this.driverAuthService.login(body.phone, body.pin, body.tenantSlug, sessionContext(req));
  }

  @Post('refresh')
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
    const user = req.user as { sid?: string };
    return this.driverAuthService.logout(user.sid);
  }

  @Post('logout-global')
  @UseGuards(DriverAuthGuard)
  async logoutGlobal(@Req() req: Request) {
    const user = req.user as { sub: string };
    return this.driverAuthService.logoutGlobal(user.sub);
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
