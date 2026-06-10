import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { BillingService } from '../../billing/billing.service';
import { TenantBillingResolverService } from '../../billing/tenant-billing-resolver.service';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';

type RequestWithTenant = {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  route?: { path?: string };
  url?: string;
  originalUrl?: string;
  user?: { tenantId?: string; type?: string };
};

@Injectable()
export class PlanGatingGuard implements CanActivate {
  private readonly logger = new Logger(PlanGatingGuard.name);

  constructor(
    private reflector: Reflector,
    private billingService: BillingService,
    private tenantBillingResolver: TenantBillingResolverService,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(REQUIRES_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const tenantId = this.resolveTenantId(request);

    if (!tenantId) {
      return true;
    }

    const state = await this.tenantBillingResolver.reconcileTenantBillingStatus(tenantId);
    this.assertTenantCanOperate(request, tenantId, state.subscriptionStatus, state.trialEndsAt, state.subscription?.gracePeriodEndsAt ?? null);

    if (requiredFeature) {
      if (state.source === 'billing_v2') {
        if (state.allowAllModules || state.includedModules.includes(requiredFeature)) {
          return true;
        }
        throw new ForbiddenException(`Seu plano não inclui a funcionalidade: ${requiredFeature}`);
      }

      const hasFeature = await this.billingService.hasFeature(tenantId, requiredFeature);
      if (!hasFeature) {
        throw new ForbiddenException(`Seu plano não inclui a funcionalidade: ${requiredFeature}`);
      }
    }

    return true;
  }

  private assertTenantCanOperate(
    request: RequestWithTenant,
    tenantId: string,
    status: string | null,
    trialEndsAt: Date | null,
    gracePeriodEndsAt: Date | null,
  ): void {
    if (this.isAlwaysAllowedTenantPath(request)) {
      return;
    }

    const now = new Date();
    const normalizedStatus = status?.toString().toLowerCase() ?? '';
    const trialExpired = normalizedStatus === 'trialing' && trialEndsAt != null && trialEndsAt < now;
    const graceExpired = normalizedStatus === 'grace_period' && gracePeriodEndsAt != null && gracePeriodEndsAt < now;
    const blockedStatus = ['past_due', 'suspended', 'canceled', 'cancelled', 'blocked'].includes(normalizedStatus);

    if (!trialExpired && !graceExpired && !blockedStatus) {
      return;
    }

    this.logger.warn({
      message: 'tenant_financial_enforcement_blocked',
      tenantId,
      status: normalizedStatus || 'none',
      trialExpired,
      graceExpired,
      method: request.method,
      path: request.originalUrl ?? request.url ?? request.route?.path,
    });

    throw new ForbiddenException({
      error: 'TENANT_FINANCIAL_BLOCKED',
      message: 'Sua assinatura precisa ser regularizada para operar. Acesse o billing para reativar.',
      details: {
        status: normalizedStatus || null,
        trialExpired,
        graceExpired,
      },
    });
  }

  private isAlwaysAllowedTenantPath(request: RequestWithTenant): boolean {
    const rawPath = request.originalUrl ?? request.url ?? request.route?.path ?? '';
    const path = rawPath.split('?')[0] ?? '';
    return [
      '/api/v1/auth/tenant',
      '/api/v1/billing',
      '/api/v1/health',
    ].some((prefix) => path.startsWith(prefix));
  }

  private resolveTenantId(request: RequestWithTenant): string | undefined {
    const headerTenantId = request.headers['x-tenant-id'];
    if (typeof headerTenantId === 'string' && headerTenantId.trim()) {
      return headerTenantId;
    }

    if (request.user?.type === 'tenant' && request.user.tenantId) {
      return request.user.tenantId;
    }

    const authorization = request.headers.authorization;
    const rawAuthorization = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = rawAuthorization?.startsWith('Bearer ') ? rawAuthorization.slice('Bearer '.length).trim() : '';
    if (!token) {
      return undefined;
    }

    try {
      const payload = this.jwtService.verify<{ type?: string; tenantId?: string }>(token);
      if (payload.type === 'tenant' && payload.tenantId) {
        return payload.tenantId;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }
}
