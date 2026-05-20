import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { DriverAuthService } from './driver-auth.service';
import { Request } from 'express';
import { DriverAuthGuard } from './guards/driver-auth.guard';
import { DriverLoginRequest, RefreshTokenRequest } from '@gestor/types';

@Controller('auth/driver')
export class DriverAuthController {
  constructor(private readonly driverAuthService: DriverAuthService) {}

  @Post('login')
  async login(@Body() body: DriverLoginRequest) {
    return this.driverAuthService.login(body.phone, body.pin);
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshTokenRequest) {
    return this.driverAuthService.refreshToken(body.refreshToken);
  }

  @Get('me')
  @UseGuards(DriverAuthGuard)
  async me(@Req() req: Request) {
    const user = req.user as { sub: string };
    // user.sub é o driverId do payload Jwt
    return this.driverAuthService.getSession(user.sub);
  }
}
