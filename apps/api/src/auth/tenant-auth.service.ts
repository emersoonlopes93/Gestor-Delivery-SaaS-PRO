import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { TenantStatus } from '@gestor/core';
import type { TenantJwtPayload } from '@gestor/types';

@Injectable()
export class TenantAuthService {
  private readonly logger = new Logger('TenantAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Authenticate a tenant user by email + password.
   * Resolves the tenant from the user record.
   */
  async login(email: string, password: string, tenantSlug?: string) {
    // Find user — if tenantSlug provided, narrow to that tenant
    let user;
    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });
      if (!tenant) {
        throw new UnauthorizedException('Tenant not found');
      }
      user = await this.prisma.tenantUser.findUnique({
        where: {
          tenantId_email: { tenantId: tenant.id, email },
        },
        include: {
          tenant: true,
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      });
    } else {
      // Find by email across tenants (first match)
      user = await this.prisma.tenantUser.findFirst({
        where: { email },
        include: {
          tenant: true,
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      });
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if ((user.tenant.status as string) !== (TenantStatus.ACTIVE as string) && 
        (user.tenant.status as string) !== (TenantStatus.TRIAL as string)) {
      throw new UnauthorizedException('Tenant is not active');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Build permissions from roles
    const roles = user.userRoles.map((ur) => ur.role.slug);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.slug),
        ),
      ),
    ];

    // Generate tokens
    const payload: TenantJwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      type: 'tenant',
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    this.logger.log(
      `Tenant user logged in: ${user.email} (tenant: ${user.tenant.slug})`,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        tenantSlug: user.tenant.slug,
        tenantName: user.tenant.name,
        roles,
        permissions,
      },
    };
  }

  /**
   * Refresh the access token using a valid refresh token.
   */
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<TenantJwtPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      });

      // Verify user still exists and is active using the isolated client
      const user = await this.prisma.tenantClient.tenantUser.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User no longer active');
      }

      const newPayload: TenantJwtPayload = {
        sub: user.id,
        tenantId: user.tenantId,
        type: 'tenant',
        email: user.email,
      };

      const newAccessToken = this.jwtService.sign(newPayload);

      return { accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Load user session data (for /me endpoint).
   */
  async getSession(userId: string) {
    const user = await this.prisma.tenantClient.tenantUser.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const roles = user.userRoles.map((ur: any) => ur.role.slug);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur: any) =>
          ur.role.rolePermissions.map((rp: any) => rp.permission.slug),
        ),
      ),
    ];

    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      roles,
      permissions,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        status: user.tenant.status,
      },
    };
  }
}
