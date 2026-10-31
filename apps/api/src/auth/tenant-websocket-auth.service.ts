import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TenantJwtPayload } from '@gestor/types';
import { JwtStrategy } from './strategies/jwt.strategy';

export type ValidatedTenantSocketAccess = TenantJwtPayload & { sid?: string };

/**
 * Adapts the canonical HTTP JWT/session validation to Socket.IO handshakes.
 * Operational socket rooms always require a session-bound tenant access token.
 */
@Injectable()
export class TenantWebSocketAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly jwtStrategy: JwtStrategy,
  ) {}

  async validateAccessToken(token: string): Promise<ValidatedTenantSocketAccess> {
    try {
      const raw = await this.jwtService.verifyAsync<Record<string, unknown>>(token);
      if (
        raw.type !== 'tenant'
        || typeof raw.sub !== 'string'
        || typeof raw.tenantId !== 'string'
        || typeof raw.email !== 'string'
      ) {
        throw new UnauthorizedException('Invalid tenant socket token');
      }

      const hasSession = typeof raw.sid === 'string';
      const isExplicitImpersonation = raw.isImpersonated === true
        && typeof raw.impersonatedBy === 'string';
      if (!hasSession && !isExplicitImpersonation) {
        throw new UnauthorizedException('Tenant socket session required');
      }

      const payload: ValidatedTenantSocketAccess = {
        type: 'tenant',
        sub: raw.sub,
        tenantId: raw.tenantId,
        email: raw.email,
        ...(hasSession ? { sid: raw.sid as string } : {}),
        ...(typeof raw.isImpersonated === 'boolean'
          ? { isImpersonated: raw.isImpersonated }
          : {}),
        ...(typeof raw.impersonatedBy === 'string'
          ? { impersonatedBy: raw.impersonatedBy }
          : {}),
      };

      await this.jwtStrategy.validate(payload);
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired tenant socket token');
    }
  }
}
