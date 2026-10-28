import { PaymentProvider, TenantSubscriptionStatus } from '@prisma/client';
import { TenantBillingResolverService } from './tenant-billing-resolver.service';

describe('TenantBillingResolverService status history', () => {
  it('creates subscription status history when creating a billing subscription', async () => {
    const prisma = {
      tenantBillingSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'subscription-1',
          tenantId: 'tenant-1',
          status: TenantSubscriptionStatus.trialing,
        }),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      },
      billingPlan: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'plan-1',
          slug: 'revenue-growth',
          isActive: true,
          trialDays: 7,
          requiresPaymentMethod: false,
        }),
      },
      tenantSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      subscriptionStatusHistory: {
        create: jest.fn(),
      },
    };
    const gateway = {
      getRuntimeConfig: jest.fn().mockReturnValue({ provider: PaymentProvider.manual }),
    };
    const service = new TenantBillingResolverService(prisma as never, gateway as never);

    await service.getOrCreateTenantBillingSubscription('tenant-1', 'plan-1');

    expect(prisma.subscriptionStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        subscriptionId: 'subscription-1',
        previousStatus: null,
        nextStatus: TenantSubscriptionStatus.trialing,
        reason: 'subscription_created',
        source: 'billing_resolver',
        actorType: 'system',
      }),
    });
  });

  it('blocks a commercial signup from creating its first subscription through the legacy flow', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ commercialSignupStartedAt: new Date() }) },
      tenantBillingSubscription: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new TenantBillingResolverService(prisma as never, {} as never);

    await expect(service.assertLegacySubscriptionCreationAllowed('tenant-1')).rejects.toThrow('contratação comercial');
  });

  it('preserves the legacy route for an existing tenant without a commercial marker', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ commercialSignupStartedAt: null }) },
      tenantBillingSubscription: { findFirst: jest.fn() },
    };
    const service = new TenantBillingResolverService(prisma as never, {} as never);

    await expect(service.assertLegacySubscriptionCreationAllowed('tenant-1')).resolves.toBeUndefined();
    expect(prisma.tenantBillingSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('does not append duplicate reconciliation history when another request wins the transition', async () => {
    const tx = {
      tenantBillingSubscription: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      subscriptionStatusHistory: { create: jest.fn() },
      tenant: { update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      tenantBillingSubscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'subscription-1',
          tenantId: 'tenant-1',
          status: TenantSubscriptionStatus.trialing,
          trialEndsAt: new Date('2026-10-01T00:00:00.000Z'),
          gracePeriodEndsAt: null,
          suspendedAt: null,
        }),
      },
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<boolean>) => callback(tx)),
    };
    const service = new TenantBillingResolverService(prisma as never, {} as never);
    jest.spyOn(service, 'getTenantBillingState').mockResolvedValue({} as never);

    await service.reconcileTenantBillingStatus('tenant-1', new Date('2026-10-02T00:00:00.000Z'));

    expect(tx.tenantBillingSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'subscription-1', status: TenantSubscriptionStatus.trialing },
    }));
    expect(tx.subscriptionStatusHistory.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
