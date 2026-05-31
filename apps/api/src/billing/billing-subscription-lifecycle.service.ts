import { Injectable } from '@nestjs/common';

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
    const status = subscription.status?.toString().toLowerCase() ?? '';
    if (!subscription.gracePeriodEndsAt) {
      return false;
    }

    const gracePeriodEndsAt = new Date(subscription.gracePeriodEndsAt);
    const now = new Date();
    return ['past_due', 'grace_period'].includes(status) && now <= gracePeriodEndsAt;
  }

  getAccessDecision(subscription: BillingSubscriptionReference): {
    canAccess: boolean;
    reason?: string;
  } {
    const status = subscription.status?.toString().toLowerCase() ?? '';

    if (status === 'canceled') {
      return { canAccess: false, reason: 'Assinatura cancelada.' };
    }

    if (status === 'suspended') {
      return { canAccess: false, reason: 'Assinatura suspensa.' };
    }

    if (status === 'past_due' && !this.isInGracePeriod(subscription)) {
      return { canAccess: false, reason: 'Assinatura em atraso.' };
    }

    if (status === 'trialing') {
      if (subscription.trialEndsAt && new Date(subscription.trialEndsAt) < new Date()) {
        return { canAccess: false, reason: 'Trial expirado.' };
      }
    }

    return { canAccess: true };
  }
}
