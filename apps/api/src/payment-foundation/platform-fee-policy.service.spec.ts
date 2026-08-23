import { Prisma } from '@prisma/client';
import { UnprocessableEntityException } from '@nestjs/common';
import { PlatformFeePolicyService } from './platform-fee-policy.service';

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
    const result = await service.resolveForTenant('tenant-free');
    expect(result.amount.toFixed(2)).toBe('0.38');
    expect(result.tenantPlanSnapshot).toBe('free:no-active-billing-plan');
  });

  it('resolves a plan-specific policy before the paid fallback', async () => {
    prisma.tenantBillingSubscription.findFirst.mockResolvedValue({ billingPlanId: 'plan-pro' });
    prisma.platformFeePolicy.findMany.mockResolvedValue([
      policy('PAID_DEFAULT', '0.20'),
      { ...policy('PLAN:plan-pro', '0.17', 2), scope: 'BILLING_PLAN', billingPlanId: 'plan-pro' },
    ]);
    const result = await service.resolveForTenant('tenant-paid');
    expect(result.amount.toFixed(2)).toBe('0.17');
    expect(result.policy.version).toBe(2);
    expect(result.tenantPlanSnapshot).toBe('billing-plan:plan-pro');
  });

  it('resolves the initial paid fallback as R$ 0.20', async () => {
    prisma.tenantBillingSubscription.findFirst.mockResolvedValue({ billingPlanId: 'plan-new' });
    prisma.platformFeePolicy.findMany.mockResolvedValue([policy('PAID_DEFAULT', '0.20')]);
    expect((await service.resolveForTenant('tenant-paid')).amount.toFixed(2)).toBe('0.20');
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
