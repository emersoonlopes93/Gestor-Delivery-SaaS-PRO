import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import type { DriverJwtPayload } from '@gestor/types';

@Injectable()
export class DriverAuthService {
  private readonly logger = new Logger('DriverAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Authenticate a driver by phone + PIN.
   */
  async login(phone: string, pin: string) {
    this.logger.debug(`Login attempt for driver phone: ${phone}`);

    const driver = await this.prisma.deliveryDriver.findFirst({
      where: { phone },
      include: {
        tenant: true,
      },
    });

    if (!driver || !driver.isActive) {
      this.logger.warn(`Login failed: Driver not found or inactive for phone: ${phone}`);
      throw new UnauthorizedException('Credenciais inválidas ou motorista inativo.');
    }

    if (!driver.pin) {
      this.logger.warn(`Login failed: Driver has no PIN set: ${phone}`);
      throw new UnauthorizedException('Acesso negado. PIN não configurado para este entregador.');
    }

    // Usually, you should use bcrypt to verify a pinned hash.
    // For raw backwards-compatibility or easy testing we accept plain or bcrypt.
    let isPinValid = false;
    
    // Check if it's a hash or plain string
    if (driver.pin.startsWith('$2a$') || driver.pin.startsWith('$2b$')) {
      isPinValid = await bcrypt.compare(pin, driver.pin);
    } else {
      isPinValid = (pin === driver.pin);
    }

    if (!isPinValid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // Generate tokens
    const payload: DriverJwtPayload = {
      sub: driver.id,
      tenantId: driver.tenantId,
      type: 'driver',
      phone: driver.phone,
      name: driver.name,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    return {
      accessToken,
      refreshToken,
      driver: {
        driverId: driver.id,
        tenantId: driver.tenantId,
        name: driver.name,
        phone: driver.phone,
        isActive: driver.isActive,
        tenant: {
          id: driver.tenant.id,
          name: driver.tenant.name,
          slug: driver.tenant.slug,
        },
      },
    };
  }

  /**
   * Refresh the access token using a valid refresh token.
   */
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<DriverJwtPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      });

      const driver = await this.prisma.deliveryDriver.findUnique({
        where: { id: payload.sub },
      });

      if (!driver || !driver.isActive) {
        throw new UnauthorizedException('Motorista inativo ou não existe mais.');
      }

      const newPayload: DriverJwtPayload = {
        sub: driver.id,
        tenantId: driver.tenantId,
        type: 'driver',
        phone: driver.phone,
        name: driver.name,
      };

      const newAccessToken = this.jwtService.sign(newPayload);

      return { accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Load session data (for /me endpoint).
   */
  async getSession(driverId: string) {
    const driver = await this.prisma.deliveryDriver.findUnique({
      where: { id: driverId },
      include: {
        tenant: true,
      },
    });

    if (!driver || !driver.isActive) {
      throw new UnauthorizedException('Driver not found or inactive');
    }

    return {
      driverId: driver.id,
      tenantId: driver.tenantId,
      name: driver.name,
      phone: driver.phone,
      isActive: driver.isActive,
      tenant: {
        id: driver.tenant.id,
        name: driver.tenant.name,
        slug: driver.tenant.slug,
      },
    };
  }
}
