import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { PlatformFeePolicyService } from './platform-fee-policy.service';

const EFFECTIVE_AT = new Date('2026-08-24T12:00:00.000Z');

function subscription(
  status: string,
  overrides: { trialEndsAt?: Date | null; gracePeriodEndsAt?: Date | null; billingPlanId?: string } = {},
) {
  return {
    billingPlanId: overrides.billingPlanId ?? 'plan-pro',
    status,
    trialEndsAt: overrides.trialEndsAt ?? null,
    gracePeriodEndsAt: overrides.gracePeriodEndsAt ?? null,
  };
}

function policy(selectorKey: string, amount: string, version = 1) {
  return {
    id: `${selectorKey}-${version}`,
    selectorKey,
    scope: selectorKey === 'FREE' ? 'FREE_TENANT' : 'PAID_DEFAULT',
    billingPlanId: null,
    feeType: 'FIXED',
    fixedAmount: new Prisma.Decimal(amount),
    currency: 'BRL',
    version,
    effectiveFrom: new Date('2026-08-23T00:00:00.000Z'),
    effectiveUntil: null,
    active: true,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    updatedAt: new Date('2026-08-23T00:00:00.000Z'),
  };
}

describe('PlatformFeePolicyService', () => {
  const prisma = {
    tenantBillingSubscription: { findFirst: jest.fn() },
    platformFeePolicy: { findMany: jest.fn() },
  };
  const service = new PlatformFeePolicyService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('resolves the initial Free policy with canonical decimal precision', async () => {
    prisma.tenantBillingSubscription.findFirst.mockResolvedValue(null);
    prisma.platformFeePolicy.findMany.mockResolvedValue([policy('FREE', '0.38')]);
    const result = await service.resolveForTenant('tenant-free', EFFECTIVE_AT);
    expect(result.amount.toFixed(2)).toBe('0.38');
    expect(result.tenantPlanSnapshot).toBe('free:no_subscription');
  });

  it('resolves a plan-specific policy before the paid fallback', async () => {
    prisma.tenantBillingSubscription.findFirst.mockResolvedValue(subscription('active'));
    prisma.platformFeePolicy.findMany.mockResolvedValue([
      policy('PAID_DEFAULT', '0.20'),
      { ...policy('PLAN:plan-pro', '0.17', 2), scope: 'BILLING_PLAN', billingPlanId: 'plan-pro' },
    ]);
    const result = await service.resolveForTenant('tenant-paid', EFFECTIVE_AT);
    expect(result.amount.toFixed(2)).toBe('0.17');
    expect(result.policy.version).toBe(2);
    expect(result.tenantPlanSnapshot).toBe('billing-plan:plan-pro');
  });

  it('resolves the initial paid fallback as R$ 0.20', async () => {
    prisma.tenantBillingSubscription.findFirst.mockResolvedValue(subscription('active', { billingPlanId: 'plan-new' }));
    prisma.platformFeePolicy.findMany.mockResolvedValue([policy('PAID_DEFAULT', '0.20')]);
    expect((await service.resolveForTenant('tenant-paid', EFFECTIVE_AT)).amount.toFixed(2)).toBe('0.20');
  });

  it.each([
    ['valid trial', subscription('trialing', { trialEndsAt: new Date('2026-08-24T12:00:01.000Z') }), '0.20', 'billing-plan:plan-pro'],
    ['trial boundary', subscription('trialing', { trialEndsAt: EFFECTIVE_AT }), '0.20', 'billing-plan:plan-pro'],
    ['expired trial', subscription('trialing', { trialEndsAt: new Date('2026-08-24T11:59:59.000Z') }), '0.38', 'free:trial_expired'],
    ['valid grace', subscription('grace_period', { gracePeriodEndsAt: new Date('2026-08-24T12:00:01.000Z') }), '0.20', 'billing-plan:plan-pro'],
    ['grace boundary', subscription('grace_period', { gracePeriodEndsAt: EFFECTIVE_AT }), '0.20', 'billing-plan:plan-pro'],
    ['expired grace', subscription('grace_period', { gracePeriodEndsAt: new Date('2026-08-24T11:59:59.000Z') }), '0.38', 'free:grace_expired'],
    ['raw past due', subscription('past_due', { gracePeriodEndsAt: new Date('2026-08-25T12:00:00.000Z') }), '0.38', 'free:past_due'],
    ['canceled', subscription('canceled'), '0.38', 'free:blocked_status'],
  ])('resolves %s from the shared effective entitlement', async (_name, tenantSubscription, amount, snapshot) => {
    prisma.tenantBillingSubscription.findFirst.mockResolvedValue(tenantSubscription);
    prisma.platformFeePolicy.findMany.mockResolvedValue([
      policy(amount === '0.20' ? 'PAID_DEFAULT' : 'FREE', amount),
    ]);

    const result = await service.resolveForTenant('tenant', EFFECTIVE_AT);

    expect(result.amount.toFixed(2)).toBe(amount);
    expect(result.tenantPlanSnapshot).toBe(snapshot);
  });

  it('selects the effective policy version without reinterpreting snapshots', async () => {
    prisma.tenantBillingSubscription.findFirst.mockResolvedValue(null);
    prisma.platformFeePolicy.findMany.mockResolvedValue([policy('FREE', '0.39', 2), policy('FREE', '0.38', 1)]);
    const result = await service.resolveForTenant('tenant-free', new Date('2026-09-01T00:00:00.000Z'));
    expect(result.policy.version).toBe(2);
    expect(result.amount.toFixed(2)).toBe('0.39');
  });

  it('fails closed when no effective policy matches', async () => {
    prisma.tenantBillingSubscription.findFirst.mockResolvedValue(null);
    prisma.platformFeePolicy.findMany.mockResolvedValue([]);
    await expect(service.resolveForTenant('tenant-free')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
