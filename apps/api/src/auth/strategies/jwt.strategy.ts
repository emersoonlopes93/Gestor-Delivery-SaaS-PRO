import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthSessionStatus, AuthSubjectType } from '@prisma/client';
import type { JwtPayload } from '@gestor/types';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-secret'),
    });
  }

  /**
   * Called by Passport after the JWT is verified.
   * The return value is attached to request.user.
   */
  async validate(payload: JwtPayload & { sid?: string }) {
    if (payload.type === 'customer' && !payload.sid) {
      throw new UnauthorizedException('Session required');
    }
    if (payload.sid) {
      const session = await this.prisma.authSession.findUnique({
        where: { id: payload.sid },
        select: {
          status: true,
          expiresAt: true,
          subjectType: true,
          subjectId: true,
          tenantId: true,
        },
      });
      const payloadTenantId = 'tenantId' in payload ? payload.tenantId : null;
      if (
        !session
        || session.status !== AuthSessionStatus.active
        || session.expiresAt <= new Date()
        || session.subjectType !== payload.type as AuthSubjectType
        || session.subjectId !== payload.sub
        || (session.tenantId !== null && session.tenantId !== payloadTenantId)
      ) {
        throw new UnauthorizedException('Session revoked');
      }
    }
    return payload;
  }
}
