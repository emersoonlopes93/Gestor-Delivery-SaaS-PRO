import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from '../../billing/billing.service';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';

@Injectable()
export class PlanGatingGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private billingService: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(REQUIRES_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'] || request.user?.tenantId;

    if (!tenantId) {
      return true; // Deixa passar se não houver contexto de tenant (ex: rotas públicas)
    }

    // Verificar acesso básico (bloqueio por inadimplência, etc)
    const access = await this.billingService.checkAccess(tenantId);
    if (!access.canAccess) {
      throw new ForbiddenException(access.reason || 'Acesso negado por questões de assinatura.');
    }

    // Verificar feature específica
    if (requiredFeature) {
      const hasFeature = await this.billingService.hasFeature(tenantId, requiredFeature);
      if (!hasFeature) {
        throw new ForbiddenException(`Seu plano não inclui a funcionalidade: ${requiredFeature}`);
      }
    }

    return true;
  }
}
