import { resolveEffectiveBillingEntitlement } from './billing-entitlement-decision';

describe('resolveEffectiveBillingEntitlement', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const plan = { billingPlanId: 'plan-pro' };

  it.each([
    ['active', { ...plan, status: 'active' }, true, 'active'],
    ['valid trial', { ...plan, status: 'trialing', trialEndsAt: new Date('2026-08-24T12:00:01.000Z') }, true, 'trial_active'],
    ['trial boundary', { ...plan, status: 'trialing', trialEndsAt: now }, true, 'trial_active'],
    ['expired trial', { ...plan, status: 'trialing', trialEndsAt: new Date('2026-08-24T11:59:59.000Z') }, false, 'trial_expired'],
    ['valid grace', { ...plan, status: 'grace_period', gracePeriodEndsAt: new Date('2026-08-24T12:00:01.000Z') }, true, 'grace_active'],
    ['grace boundary', { ...plan, status: 'grace_period', gracePeriodEndsAt: now }, true, 'grace_active'],
    ['expired grace', { ...plan, status: 'grace_period', gracePeriodEndsAt: new Date('2026-08-24T11:59:59.000Z') }, false, 'grace_expired'],
    ['past due with future grace', { ...plan, status: 'past_due', gracePeriodEndsAt: new Date('2026-08-25T12:00:00.000Z') }, false, 'past_due'],
    ['canceled', { ...plan, status: 'canceled' }, false, 'blocked_status'],
    ['no subscription', null, false, 'no_subscription'],
  ] as const)('classifies %s without duplicating billing time semantics', (_name, reference, paid, reason) => {
    const result = resolveEffectiveBillingEntitlement(reference, now);

    expect(result.hasPaidEntitlement).toBe(paid);
    expect(result.effectivePlanId).toBe(paid ? 'plan-pro' : null);
    expect(result.reason).toBe(reason);
  });

  it('tracks a past_due grace window without granting paid entitlement or operation', () => {
    const result = resolveEffectiveBillingEntitlement({
      ...plan,
      status: 'past_due',
      gracePeriodEndsAt: new Date('2026-08-24T12:00:01.000Z'),
    }, now);

    expect(result.inGraceWindow).toBe(true);
    expect(result.hasPaidEntitlement).toBe(false);
    expect(result.canOperate).toBe(false);
  });
});
