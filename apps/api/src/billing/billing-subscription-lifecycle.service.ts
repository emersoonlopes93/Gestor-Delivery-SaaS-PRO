import { Injectable } from '@nestjs/common';
import { resolveEffectiveBillingEntitlement } from './billing-entitlement-decision';

type BillingSubscriptionReference = {
  status?: string | null;
  trialEndsAt?: Date | string | null;
  gracePeriodEndsAt?: Date | string | null;
  currentCycleEndsAt?: Date | string | null;
};

@Injectable()
export class BillingSubscriptionLifecycleService {
  isSubscriptionActive(status?: string | null): boolean {
    const normalized = status?.toString().toLowerCase() ?? '';
    return ['active', 'trialing', 'grace_period'].includes(normalized);
  }

  isInGracePeriod(subscription: BillingSubscriptionReference): boolean {
    return resolveEffectiveBillingEntitlement(subscription).inGraceWindow;
  }

  getAccessDecision(subscription: BillingSubscriptionReference): {
    canAccess: boolean;
    reason?: string;
  } {
    const status = subscription.status?.toString().toLowerCase() ?? '';
    const entitlement = resolveEffectiveBillingEntitlement(subscription);

    if (status === 'canceled') {
      return { canAccess: false, reason: 'Assinatura cancelada.' };
    }

    if (status === 'suspended') {
      return { canAccess: false, reason: 'Assinatura suspensa.' };
    }

    if (status === 'past_due' && !entitlement.inGraceWindow) {
      return { canAccess: false, reason: 'Assinatura em atraso.' };
    }

    if (status === 'trialing' && entitlement.trialExpired) {
      return { canAccess: false, reason: 'Trial expirado.' };
    }

    return { canAccess: true };
  }
}
