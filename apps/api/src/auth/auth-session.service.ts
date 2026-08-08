import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionStatus, AuthSubjectType, Prisma } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../database/prisma.service';

export type SessionContext = {
  userAgent?: string;
  ipAddress?: string;
  deviceLabel?: string;
};

type CreateSessionInput = {
  subjectType: AuthSubjectType;
  subjectId: string;
  tenantId?: string | null;
  adminUserId?: string | null;
  userId?: string | null;
  role?: string | null;
  payload: object;
  context?: SessionContext;
};

type RotateSessionInput = {
  refreshToken: string;
  expectedSubjectType: AuthSubjectType;
  expectedTenantId?: string;
  expectedSubjectId?: string;
  preserveAbsoluteExpiry?: boolean;
  context?: SessionContext;
};

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async createSession(input: CreateSessionInput) {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const expiresAt = this.refreshExpiresAt();
    const refreshPayload = {
      ...input.payload,
      sid: sessionId,
      familyId,
    };
    const refreshToken = this.signRefreshToken(refreshPayload);

    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        tenantId: input.tenantId ?? null,
        adminUserId: input.adminUserId ?? null,
        userId: input.userId ?? null,
        role: input.role ?? null,
        refreshTokenHash: this.hashToken(refreshToken),
        refreshTokenFamilyId: familyId,
        userAgent: input.context?.userAgent,
        ipAddress: input.context?.ipAddress,
        deviceLabel: input.context?.deviceLabel,
        expiresAt,
        metadata: {
          issuedAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log({
      message: 'auth_session_created',
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      tenantId: input.tenantId ?? null,
      sessionId,
      familyId,
    });

    return { refreshToken, sessionId, familyId, expiresAt };
  }

  async rotateSession(input: RotateSessionInput) {
    const payload = this.verifyRefreshPayload(input.refreshToken);
    if (payload.type !== input.expectedSubjectType) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const sessionId = this.asString(payload.sid);
    const familyId = this.asString(payload.familyId);
    if (!sessionId || !familyId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
    });
    if (
      !session
      || session.refreshTokenFamilyId !== familyId
      || session.subjectType !== input.expectedSubjectType
      || (input.expectedTenantId !== undefined && session.tenantId !== input.expectedTenantId)
      || (input.expectedSubjectId !== undefined && session.subjectId !== input.expectedSubjectId)
      || this.asString(payload.sub) !== session.subjectId
      || (session.tenantId !== null && this.asString(payload.tenantId) !== session.tenantId)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.status !== AuthSessionStatus.active) {
      if (session.status === AuthSessionStatus.rotated) {
        await this.revokeFamily(familyId, 'refresh_reuse_detected', AuthSessionStatus.compromised);
        this.logger.warn({
          message: 'auth_refresh_reuse_detected',
          subjectType: session.subjectType,
          subjectId: session.subjectId,
          tenantId: session.tenantId,
          sessionId: session.id,
          familyId,
        });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.expiresAt <= new Date()) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: {
          status: AuthSessionStatus.expired,
          revokedAt: new Date(),
          revokedReason: 'expired',
        },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const presentedHash = this.hashToken(input.refreshToken);
    if (!this.safeEqual(presentedHash, session.refreshTokenHash)) {
      await this.revokeFamily(familyId, 'refresh_hash_mismatch', AuthSessionStatus.compromised);
      this.logger.warn({
        message: 'auth_refresh_hash_mismatch',
        subjectType: session.subjectType,
        subjectId: session.subjectId,
        tenantId: session.tenantId,
        sessionId: session.id,
        familyId,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextSessionId = randomUUID();
    const refreshPayload = {
      ...this.stripJwtRegisteredClaims(payload),
      sid: nextSessionId,
      familyId,
    };
    const nextExpiresAt = input.preserveAbsoluteExpiry ? session.expiresAt : this.refreshExpiresAt();
    const nextRefreshToken = this.signRefreshToken(
      refreshPayload,
      input.preserveAbsoluteExpiry ? nextExpiresAt : undefined,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.authSession.updateMany({
          where: {
            id: session.id,
            status: AuthSessionStatus.active,
            refreshTokenHash: presentedHash,
          },
        data: {
          status: AuthSessionStatus.rotated,
          lastUsedAt: new Date(),
          replacedBySessionId: nextSessionId,
        },
        });
        if (consumed.count !== 1) {
          throw new UnauthorizedException('Invalid refresh token');
        }
        await tx.authSession.create({
        data: {
          id: nextSessionId,
          subjectType: session.subjectType,
          subjectId: session.subjectId,
          tenantId: session.tenantId,
          adminUserId: session.adminUserId,
          userId: session.userId,
          role: session.role,
          refreshTokenHash: this.hashToken(nextRefreshToken),
          refreshTokenFamilyId: familyId,
          previousSessionId: session.id,
          userAgent: input.context?.userAgent ?? session.userAgent,
          ipAddress: input.context?.ipAddress ?? session.ipAddress,
          deviceLabel: session.deviceLabel,
          expiresAt: nextExpiresAt,
          metadata: this.mergeMetadata(session.metadata, {
            rotatedFromSessionId: session.id,
            rotatedAt: new Date().toISOString(),
          }),
        },
        });
      });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw error;
    }

    this.logger.log({
      message: 'auth_refresh_rotated',
      subjectType: session.subjectType,
      subjectId: session.subjectId,
      tenantId: session.tenantId,
      sessionId: nextSessionId,
      previousSessionId: session.id,
      familyId,
    });

    return {
      payload,
      session,
      refreshToken: nextRefreshToken,
      sessionId: nextSessionId,
      familyId,
    };
  }

  async revokeSession(sessionId: string | undefined, reason: string) {
    if (!sessionId) return { revoked: false };
    const session = await this.prisma.authSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== AuthSessionStatus.active) return { revoked: false };
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: {
        status: AuthSessionStatus.revoked,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
    this.logger.log({
      message: 'auth_session_revoked',
      subjectType: session.subjectType,
      subjectId: session.subjectId,
      tenantId: session.tenantId,
      sessionId,
      reason,
    });
    return { revoked: true };
  }

  async revokeSubjectSessions(subjectType: AuthSubjectType, subjectId: string, reason: string) {
    const result = await this.prisma.authSession.updateMany({
      where: {
        subjectType,
        subjectId,
        status: AuthSessionStatus.active,
      },
      data: {
        status: AuthSessionStatus.revoked,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
    this.logger.log({
      message: 'auth_subject_sessions_revoked',
      subjectType,
      subjectId,
      count: result.count,
      reason,
    });
    return { revoked: result.count };
  }

  async revokeAllActiveSessions(reason: string) {
    const activeBefore = await this.prisma.authSession.count({
      where: { status: AuthSessionStatus.active },
    });
    const result = await this.prisma.authSession.updateMany({
      where: { status: AuthSessionStatus.active },
      data: {
        status: AuthSessionStatus.revoked,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
    const activeAfter = await this.prisma.authSession.count({
      where: { status: AuthSessionStatus.active },
    });
    this.logger.warn({
      message: 'auth_global_sessions_revoked',
      activeBefore,
      revoked: result.count,
      activeAfter,
      reason,
    });
    return { activeBefore, revoked: result.count, activeAfter };
  }

  async listActiveSessions(subjectType: AuthSubjectType, subjectId: string) {
    return this.prisma.authSession.findMany({
      where: {
        subjectType,
        subjectId,
        status: AuthSessionStatus.active,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        subjectType: true,
        tenantId: true,
        userAgent: true,
        ipAddress: true,
        deviceLabel: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  private async revokeFamily(familyId: string, reason: string, status: AuthSessionStatus) {
    await this.prisma.authSession.updateMany({
      where: { refreshTokenFamilyId: familyId },
      data: {
        status,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  private verifyRefreshPayload(refreshToken: string): Record<string, unknown> {
    try {
      return this.jwtService.verify<Record<string, unknown>>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private signRefreshToken(payload: object, absoluteExpiresAt?: Date) {
    const expiresIn = absoluteExpiresAt
      ? Math.max(1, Math.floor((absoluteExpiresAt.getTime() - Date.now()) / 1000))
      : this.config.get('JWT_REFRESH_EXPIRES_IN', '7d');
    return this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      expiresIn,
    });
  }

  private stripJwtRegisteredClaims(payload: Record<string, unknown>) {
    const { exp, iat, nbf, jti, ...rest } = payload;
    void exp;
    void iat;
    void nbf;
    void jti;
    return rest;
  }

  private refreshExpiresAt() {
    const value = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    return new Date(Date.now() + this.durationToMs(value));
  }

  private durationToMs(value: string) {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return amount * multipliers[unit];
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private asString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private mergeMetadata(
    metadata: Prisma.JsonValue | null,
    extra: Prisma.InputJsonObject,
  ): Prisma.InputJsonObject {
    return {
      ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
      ...extra,
    };
  }
}
