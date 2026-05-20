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
   * Authenticate a driver by phone + PIN + tenantSlug.
   */
  async login(phone: string, pin: string, tenantSlug: string) {
    this.logger.debug(`Login attempt for driver phone: ${phone} in tenant: ${tenantSlug}`);

    const normalizedPhone = phone.replace(/\D/g, '');

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      this.logger.warn(`Login failed: Tenant not found with slug: ${tenantSlug}`);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const driver = await this.prisma.deliveryDriver.findUnique({
      where: {
        tenantId_phone: {
          tenantId: tenant.id,
          phone: normalizedPhone,
        },
      },
      include: {
        tenant: true,
      },
    });

    if (!driver || !driver.isActive) {
      this.logger.warn(`Login failed: Driver not found or inactive for phone: ${normalizedPhone} in tenant: ${tenant.id}`);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (!driver.pin) {
      this.logger.warn(`Login failed: Driver has no PIN set: ${normalizedPhone}`);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const isPinValid = await bcrypt.compare(pin, driver.pin);

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
