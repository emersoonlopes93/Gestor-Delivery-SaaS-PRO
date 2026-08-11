import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthSessionStatus, AuthSubjectType } from '@prisma/client';
import { DriverStatus, type DriverJwtPayload, type DriverLoginResponse, type DriverLoginResult } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { AuthSessionService } from './auth-session.service';

type RequestSessionContext = {
  userAgent?: string;
  ipAddress?: string;
};

type DriverCandidate = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  pin: string | null;
  isActive: boolean;
  status: import('@prisma/client').DriverStatus;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
};

type ValidatedDriverAccess = DriverJwtPayload & { sid: string };

@Injectable()
export class DriverAuthService {
  private readonly logger = new Logger('DriverAuthService');
  private readonly dummyPinHash = bcrypt.hashSync('invalid-driver-credential', 10);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async login(phone: string, pin: string, tenantSlug?: string, context?: RequestSessionContext): Promise<DriverLoginResult> {
    const normalizedPhone = phone.replace(/\D/g, '');
    const candidates = await this.prisma.deliveryDriver.findMany({
      where: {
        phone: normalizedPhone,
        isActive: true,
        pin: { not: null },
        tenant: { status: { in: ['active', 'trial'] } },
      },
      include: { tenant: true },
      orderBy: [{ tenantId: 'asc' }, { id: 'asc' }],
    });

    const comparisonCandidates = candidates.length > 0
      ? candidates
      : [{ pin: this.dummyPinHash }];
    const comparisons = await Promise.all(
      comparisonCandidates.map((candidate) => bcrypt.compare(pin, candidate.pin ?? this.dummyPinHash)),
    );
    const authenticatedCandidates = candidates.filter((_candidate, index) => comparisons[index]);
    const legacySlug = tenantSlug?.trim();
    const eligibleCandidates = legacySlug
      ? authenticatedCandidates.filter((candidate) => candidate.tenant.slug === legacySlug)
      : authenticatedCandidates;

    if (eligibleCandidates.length === 0) {
      this.logger.warn('driver_login_failed');
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    if (eligibleCandidates.length === 1) {
      return this.createDriverSession(eligibleCandidates[0], context);
    }

    const selectionToken = this.jwtService.sign(
      {
        type: 'driver_tenant_selection',
        driverIds: eligibleCandidates.map((candidate) => candidate.id),
      },
      { expiresIn: '5m' },
    );

    return {
      requiresTenantSelection: true,
      selectionToken,
      tenants: eligibleCandidates.map((candidate) => ({
        driverId: candidate.id,
        tenant: {
          id: candidate.tenant.id,
          name: candidate.tenant.name,
        },
      })),
    };
  }

  async selectTenant(selectionToken: string, driverId: string, context?: RequestSessionContext): Promise<DriverLoginResponse> {
    const allowedDriverIds = this.verifySelectionToken(selectionToken);
    if (!allowedDriverIds.includes(driverId)) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const driver = await this.prisma.deliveryDriver.findFirst({
      where: {
        id: driverId,
        isActive: true,
        pin: { not: null },
        tenant: { status: { in: ['active', 'trial'] } },
      },
      include: { tenant: true },
    });

    if (!driver) throw new UnauthorizedException('Credenciais invalidas.');
    return this.createDriverSession(driver, context);
  }

  async validateAccessToken(token: string): Promise<ValidatedDriverAccess> {
    try {
      const raw = await this.jwtService.verifyAsync<Record<string, unknown>>(token);
      const sub = typeof raw.sub === 'string' ? raw.sub : '';
      const tenantId = typeof raw.tenantId === 'string' ? raw.tenantId : '';
      const sid = typeof raw.sid === 'string' ? raw.sid : '';
      if (raw.type !== 'driver' || !sub || !tenantId || !sid) {
        throw new UnauthorizedException('Invalid driver token');
      }

      const [session, driver] = await Promise.all([
        this.prisma.authSession.findUnique({
          where: { id: sid },
          select: {
            status: true,
            expiresAt: true,
            subjectType: true,
            subjectId: true,
            tenantId: true,
          },
        }),
        this.prisma.deliveryDriver.findFirst({
          where: {
            id: sub,
            tenantId,
            isActive: true,
            tenant: { status: { in: ['active', 'trial'] } },
          },
          select: { id: true },
        }),
      ]);

      if (
        !session
        || session.status !== AuthSessionStatus.active
        || session.expiresAt <= new Date()
        || session.subjectType !== AuthSubjectType.driver
        || session.subjectId !== sub
        || session.tenantId !== tenantId
        || !driver
      ) {
        throw new UnauthorizedException('Invalid driver session');
      }

      return {
        sub,
        tenantId,
        sid,
        type: 'driver',
        phone: typeof raw.phone === 'string' ? raw.phone : '',
        name: typeof raw.name === 'string' ? raw.name : '',
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async createDriverSession(driver: DriverCandidate, context?: RequestSessionContext): Promise<DriverLoginResponse> {
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
        status: driver.status as DriverStatus,
        tenant: {
          id: driver.tenant.id,
          name: driver.tenant.name,
          slug: driver.tenant.slug,
        },
      },
    };
  }

  private verifySelectionToken(selectionToken: string): string[] {
    try {
      const payload = this.jwtService.verify<Record<string, unknown>>(selectionToken);
      if (payload.type !== 'driver_tenant_selection' || !Array.isArray(payload.driverIds)) {
        throw new UnauthorizedException('Invalid selection token');
      }
      const driverIds = payload.driverIds.filter((value): value is string => typeof value === 'string');
      if (driverIds.length === 0 || driverIds.length !== payload.driverIds.length) {
        throw new UnauthorizedException('Invalid selection token');
      }
      return driverIds;
    } catch {
      throw new UnauthorizedException('Credenciais invalidas.');
    }
  }

  async refreshToken(refreshToken: string, context?: RequestSessionContext) {
    try {
      const rotated = await this.authSessionService.rotateSession({
        refreshToken,
        expectedSubjectType: AuthSubjectType.driver,
        context,
      });
      const payload = this.asDriverPayload(rotated.payload);

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
    const driver = await this.prisma.deliveryDriver.findFirst({
      where: {
        id: driverId,
        isActive: true,
        tenant: { status: { in: ['active', 'trial'] } },
      },
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

  private asDriverPayload(value: unknown): DriverJwtPayload {
    if (!value || typeof value !== 'object') throw new UnauthorizedException('Invalid refresh token');
    const payload = value as Record<string, unknown>;
    if (
      payload.type !== 'driver'
      || typeof payload.sub !== 'string'
      || typeof payload.tenantId !== 'string'
      || typeof payload.phone !== 'string'
      || typeof payload.name !== 'string'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return {
      type: 'driver',
      sub: payload.sub,
      tenantId: payload.tenantId,
      phone: payload.phone,
      name: payload.name,
    };
  }
}
