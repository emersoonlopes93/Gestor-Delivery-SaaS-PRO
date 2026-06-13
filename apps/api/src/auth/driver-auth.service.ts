import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthSubjectType } from '@prisma/client';
import type { DriverJwtPayload } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { AuthSessionService } from './auth-session.service';

type RequestSessionContext = {
  userAgent?: string;
  ipAddress?: string;
};

@Injectable()
export class DriverAuthService {
  private readonly logger = new Logger('DriverAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async login(phone: string, pin: string, tenantSlug: string, context?: RequestSessionContext) {
    this.logger.debug(`Login attempt for driver phone: ${phone} in tenant: ${tenantSlug}`);

    const normalizedPhone = phone.replace(/\D/g, '');
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      this.logger.warn(`Login failed: Tenant not found with slug: ${tenantSlug}`);
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const driver = await this.prisma.deliveryDriver.findUnique({
      where: {
        tenantId_phone: {
          tenantId: tenant.id,
          phone: normalizedPhone,
        },
      },
      include: { tenant: true },
    });

    if (!driver || !driver.isActive || !driver.pin) {
      this.logger.warn(`Login failed: Driver not found, inactive or without PIN: ${normalizedPhone}`);
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const isPinValid = await bcrypt.compare(pin, driver.pin);
    if (!isPinValid) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const payload: DriverJwtPayload = {
      sub: driver.id,
      tenantId: driver.tenantId,
      type: 'driver',
      phone: driver.phone,
      name: driver.name,
    };

    const session = await this.authSessionService.createSession({
      subjectType: AuthSubjectType.driver,
      subjectId: driver.id,
      tenantId: driver.tenantId,
      userId: driver.id,
      role: 'driver',
      payload,
      context,
    });
    const accessToken = this.jwtService.sign({ ...payload, sid: session.sessionId });

    return {
      accessToken,
      refreshToken: session.refreshToken,
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

  async refreshToken(refreshToken: string, context?: RequestSessionContext) {
    try {
      const rotated = await this.authSessionService.rotateSession({
        refreshToken,
        expectedSubjectType: AuthSubjectType.driver,
        context,
      });
      const payload = (rotated.payload as unknown) as DriverJwtPayload;

      const driver = await this.prisma.deliveryDriver.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
      });

      if (!driver || !driver.isActive) {
        throw new UnauthorizedException('Motorista inativo ou nao existe mais.');
      }
      if (!['active', 'trial'].includes(String(driver.tenant.status))) {
        throw new UnauthorizedException('Tenant is not active');
      }

      const newPayload: DriverJwtPayload = {
        sub: driver.id,
        tenantId: driver.tenantId,
        type: 'driver',
        phone: driver.phone,
        name: driver.name,
      };

      return {
        accessToken: this.jwtService.sign({ ...newPayload, sid: rotated.sessionId }),
        refreshToken: rotated.refreshToken,
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(sessionId?: string) {
    await this.authSessionService.revokeSession(sessionId, 'logout');
    return { success: true };
  }

  async logoutGlobal(driverId: string) {
    await this.authSessionService.revokeSubjectSessions(AuthSubjectType.driver, driverId, 'logout_global');
    return { success: true };
  }

  async listSessions(driverId: string) {
    return this.authSessionService.listActiveSessions(AuthSubjectType.driver, driverId);
  }

  async getSession(driverId: string) {
    const driver = await this.prisma.deliveryDriver.findUnique({
      where: { id: driverId },
      include: { tenant: true },
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
