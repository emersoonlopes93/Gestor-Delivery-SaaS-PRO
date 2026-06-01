import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from '../../billing/billing.service';
import { TenantBillingResolverService } from '../../billing/tenant-billing-resolver.service';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';

type RequestWithTenant = {
  headers: Record<string, string | string[] | undefined>;
  user?: { tenantId?: string };
};

@Injectable()
export class PlanGatingGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private billingService: BillingService,
    private tenantBillingResolver: TenantBillingResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(REQUIRES_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const headerTenantId = request.headers['x-tenant-id'];
    const tenantId = typeof headerTenantId === 'string' ? headerTenantId : request.user?.tenantId;

    if (!tenantId) {
      return true;
    }

    const state = await this.tenantBillingResolver.getTenantBillingState(tenantId);

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
}
