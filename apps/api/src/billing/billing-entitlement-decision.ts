export type BillingEntitlementReference = {
  status?: string | null;
  billingPlanId?: string | null;
  trialEndsAt?: Date | string | null;
  gracePeriodEndsAt?: Date | string | null;
};

export type EffectiveBillingEntitlement = {
  effectiveStatus: string | null;
  effectivePlanId: string | null;
  hasPaidEntitlement: boolean;
  canOperate: boolean;
  inGraceWindow: boolean;
  trialExpired: boolean;
  graceExpired: boolean;
  reason:
    | 'no_subscription'
    | 'active'
    | 'trial_active'
    | 'trial_expired'
    | 'grace_active'
    | 'grace_expired'
    | 'past_due'
    | 'blocked_status'
    | 'non_paid_status';
};

const BLOCKED_STATUSES = new Set(['past_due', 'suspended', 'canceled', 'cancelled', 'blocked']);

export function resolveEffectiveBillingEntitlement(
  subscription: BillingEntitlementReference | null | undefined,
  effectiveAt = new Date(),
): EffectiveBillingEntitlement {
  const status = subscription?.status?.toString().toLowerCase() ?? '';
  const trialExpired = status === 'trialing'
    && subscription?.trialEndsAt != null
    && new Date(subscription.trialEndsAt) < effectiveAt;
  const graceExpired = status === 'grace_period'
    && subscription?.gracePeriodEndsAt != null
    && new Date(subscription.gracePeriodEndsAt) < effectiveAt;
  const inGraceWindow = ['past_due', 'grace_period'].includes(status)
    && subscription?.gracePeriodEndsAt != null
    && effectiveAt <= new Date(subscription.gracePeriodEndsAt);

  let hasPaidEntitlement = false;
  let reason: EffectiveBillingEntitlement['reason'] = 'non_paid_status';

  if (!status) {
    reason = 'no_subscription';
  } else if (status === 'active') {
    hasPaidEntitlement = true;
    reason = 'active';
  } else if (status === 'trialing') {
    hasPaidEntitlement = !trialExpired;
    reason = trialExpired ? 'trial_expired' : 'trial_active';
  } else if (status === 'grace_period') {
    hasPaidEntitlement = !graceExpired;
    reason = graceExpired ? 'grace_expired' : 'grace_active';
  } else if (status === 'past_due') {
    reason = 'past_due';
  } else if (BLOCKED_STATUSES.has(status)) {
    reason = 'blocked_status';
  }

  return {
    effectiveStatus: status || null,
    effectivePlanId: hasPaidEntitlement ? subscription?.billingPlanId ?? null : null,
    hasPaidEntitlement,
    canOperate: !trialExpired && !graceExpired && !BLOCKED_STATUSES.has(status),
    inGraceWindow,
    trialExpired,
    graceExpired,
    reason,
  };
}
