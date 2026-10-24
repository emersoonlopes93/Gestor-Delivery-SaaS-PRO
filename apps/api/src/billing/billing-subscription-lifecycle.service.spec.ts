import { BillingSubscriptionLifecycleService } from './billing-subscription-lifecycle.service';

describe('BillingSubscriptionLifecycleService shared entitlement decision', () => {
  const service = new BillingSubscriptionLifecycleService();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-24T12:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('preserves access for past_due only while its lifecycle grace window is valid', () => {
    expect(service.getAccessDecision({
      status: 'past_due',
      gracePeriodEndsAt: new Date('2026-08-24T12:00:01.000Z'),
    })).toEqual({ canAccess: true });
    expect(service.getAccessDecision({
      status: 'past_due',
      gracePeriodEndsAt: new Date('2026-08-24T11:59:59.000Z'),
    })).toEqual({ canAccess: false, reason: 'Assinatura em atraso.' });
  });

  it('preserves the inclusive grace boundary', () => {
    expect(service.isInGracePeriod({
      status: 'grace_period',
      gracePeriodEndsAt: new Date('2026-08-24T12:00:00.000Z'),
    })).toBe(true);
  });

  it('continues to reject an expired trial', () => {
    expect(service.getAccessDecision({
      status: 'trialing',
      trialEndsAt: new Date('2026-08-24T11:59:59.000Z'),
    })).toEqual({ canAccess: false, reason: 'Trial expirado.' });
  });
});
