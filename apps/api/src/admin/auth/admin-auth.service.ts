import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import type { AdminJwtPayload } from '@gestor/types';
import { AuthSessionService } from '../../auth/auth-session.service';
import { AuthSubjectType } from '@prisma/client';

type RequestSessionContext = {
  userAgent?: string;
  ipAddress?: string;
};

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger('AdminAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  /**
   * Authenticate a SaaS admin user.
   */
  async login(email: string, password: string, context?: RequestSessionContext) {
    const normalizedEmail = email.toLowerCase();
    const user = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
      include: {
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
      this.logger.warn(`Admin login failed: User not found or inactive: ${normalizedEmail}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      this.logger.warn(`Admin login failed: Invalid password for: ${normalizedEmail}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const roles = user.userRoles.map((ur) => ur.role.slug);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.slug),
        ),
      ),
    ];

    const payload: AdminJwtPayload = {
      sub: user.id,
      type: 'admin',
      email: user.email,
    };

    const session = await this.authSessionService.createSession({
      subjectType: AuthSubjectType.admin,
      subjectId: user.id,
      adminUserId: user.id,
      role: roles.join(','),
      payload,
      context,
    });
    const accessToken = this.jwtService.sign({ ...payload, sid: session.sessionId });

    this.logger.log(`Admin user logged in: ${user.email}`);

    return {
      accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
        permissions,
      },
    };
  }

  /**
   * Refresh admin access token.
   */
  async refreshToken(refreshToken: string, context?: RequestSessionContext) {
    try {
      const rotated = await this.authSessionService.rotateSession({
        refreshToken,
        expectedSubjectType: AuthSubjectType.admin,
        context,
      });
      const payload = rotated.payload as unknown as AdminJwtPayload;

      if (payload.type !== 'admin') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.adminUser.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User no longer active');
      }

      const newPayload: AdminJwtPayload = {
        sub: user.id,
        type: 'admin',
        email: user.email,
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

  async logoutGlobal(userId: string) {
    await this.authSessionService.revokeSubjectSessions(AuthSubjectType.admin, userId, 'logout_global');
    return { success: true };
  }

  async listSessions(userId: string) {
    return this.authSessionService.listActiveSessions(AuthSubjectType.admin, userId);
  }

  /**
   * Get admin session.
   */
  async getSession(userId: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      include: {
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

    const roles = user.userRoles.map((ur) => ur.role.slug);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.slug),
        ),
      ),
    ];

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions,
    };
  }
}
