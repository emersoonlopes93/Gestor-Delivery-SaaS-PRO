import { ConflictException } from '@nestjs/common';
import { PaymentProvider, TenantSubscriptionStatus } from '@prisma/client';
import { COMMERCIAL_OFFER_TERMS_VERSION, TenantBillingResolverService } from './tenant-billing-resolver.service';

describe('Commercial self-service subscription', () => {
  const createPlan = () => ({
    id: 'plan-public', slug: 'growth', name: 'Growth', type: 'revenue_tiered', cycleInterval: 'monthly', currency: 'BRL',
    trialDays: 7, requiresPaymentMethod: false,
    revenueTiers: [{ id: 'tier-1', minRevenue: { toString: () => '0' }, maxRevenue: null, price: { toString: () => '49.90' }, label: 'Inicial', sortOrder: 0 }],
  });

  it('uses only active public revenue-tiered plans for the public catalog', async () => {
    const prisma = { billingPlan: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new TenantBillingResolverService(prisma as never, {} as never);

    await service.listPublicCommercialPlans();

    expect(prisma.billingPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, isPublic: true, type: 'revenue_tiered' },
    }));
  });

  it('persists one commercial acceptance with the authoritative plan snapshot', async () => {
    const subscription = { id: 'sub-1', tenantId: 'tenant-1', billingPlanId: 'plan-public', status: TenantSubscriptionStatus.trialing, requiresPaymentMethod: false };
    const tx = {
      $executeRaw: jest.fn(),
      tenantBillingSubscription: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(subscription) },
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      billingPlan: { findFirst: jest.fn().mockResolvedValue(createPlan()) },
      billingRuleVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'rule-1', version: 3, name: 'Faturamento elegível' }) },
      subscriptionStatusHistory: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    const service = new TenantBillingResolverService(prisma as never, { getRuntimeConfig: jest.fn().mockReturnValue({ provider: PaymentProvider.manual }) } as never);

    await expect(service.subscribeToPublicCommercialPlan({ tenantId: 'tenant-1', actorId: 'owner-1', planId: 'plan-public', termsVersion: COMMERCIAL_OFFER_TERMS_VERSION })).resolves.toMatchObject({ created: true, canProceedToOnboarding: true });
    expect(tx.subscriptionStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reason: 'commercial_offer_accepted', actorId: 'owner-1', metadata: expect.objectContaining({ termsVersion: COMMERCIAL_OFFER_TERMS_VERSION }) }) }));
  });

  it('returns the existing matching subscription and never changes its plan', async () => {
    const existing = { id: 'sub-1', tenantId: 'tenant-1', billingPlanId: 'plan-public', status: TenantSubscriptionStatus.trialing, requiresPaymentMethod: false };
    const tx = { $executeRaw: jest.fn(), tenantBillingSubscription: { findFirst: jest.fn().mockResolvedValue(existing) } };
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    const service = new TenantBillingResolverService(prisma as never, {} as never);

    await expect(service.subscribeToPublicCommercialPlan({ tenantId: 'tenant-1', actorId: 'owner-1', planId: 'plan-public', termsVersion: COMMERCIAL_OFFER_TERMS_VERSION })).resolves.toMatchObject({ created: false, subscriptionId: 'sub-1' });
  });

  it('rejects a retry that attempts to silently select a different plan', async () => {
    const tx = { $executeRaw: jest.fn(), tenantBillingSubscription: { findFirst: jest.fn().mockResolvedValue({ billingPlanId: 'existing-plan' }) } };
    const prisma = { $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
    const service = new TenantBillingResolverService(prisma as never, {} as never);

    await expect(service.subscribeToPublicCommercialPlan({ tenantId: 'tenant-1', actorId: 'owner-1', planId: 'other-plan', termsVersion: COMMERCIAL_OFFER_TERMS_VERSION })).rejects.toBeInstanceOf(ConflictException);
  });
});
