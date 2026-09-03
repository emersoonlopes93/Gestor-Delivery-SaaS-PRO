import { ForbiddenException } from '@nestjs/common';
import { PlanGatingGuard } from './plan-gating.guard';

describe('PlanGatingGuard financial enforcement', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const billingService = {
    hasFeature: jest.fn(),
  };
  const tenantBillingResolver = {
    reconcileTenantBillingStatus: jest.fn(),
  };
  const jwtService = {
    verify: jest.fn(),
  };
  const featureControlService = {
    resolveTenantFeature: jest.fn(),
  };

  const makeGuard = () =>
    new PlanGatingGuard(
      reflector as never,
      billingService as never,
      tenantBillingResolver as never,
      jwtService as never,
      featureControlService as never,
    );

  const makeContext = (path: string) => ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {},
        method: 'GET',
        originalUrl: path,
        user: { type: 'tenant', tenantId: 'tenant-1' },
      }),
    }),
  });

  beforeEach(() => {
    jest.resetAllMocks();
    reflector.getAllAndOverride.mockReturnValue(undefined);
    featureControlService.resolveTenantFeature.mockResolvedValue({
      enabled: true,
      reason: 'enabled',
      source: 'feature_catalog',
    });
  });

  it('blocks operational tenant routes when subscription is suspended', async () => {
    tenantBillingResolver.reconcileTenantBillingStatus.mockResolvedValue({
      subscriptionStatus: 'suspended',
      trialEndsAt: null,
      subscription: { gracePeriodEndsAt: null },
      source: 'billing_v2',
      allowAllModules: true,
      includedModules: [],
    });

    await expect(makeGuard().canActivate(makeContext('/api/v1/orders') as never))
      .rejects
      .toBeInstanceOf(ForbiddenException);
  });

  it('allows billing routes when subscription is suspended', async () => {
    tenantBillingResolver.reconcileTenantBillingStatus.mockResolvedValue({
      subscriptionStatus: 'suspended',
      trialEndsAt: null,
      subscription: { gracePeriodEndsAt: null },
      source: 'billing_v2',
      allowAllModules: true,
      includedModules: [],
    });

    await expect(makeGuard().canActivate(makeContext('/api/v1/billing/portal') as never))
      .resolves
      .toBe(true);
  });

  it('keeps a valid grace period operational through the shared decision', async () => {
    tenantBillingResolver.reconcileTenantBillingStatus.mockResolvedValue({
      subscriptionStatus: 'grace_period',
      trialEndsAt: null,
      subscription: { gracePeriodEndsAt: new Date(Date.now() + 60_000) },
      source: 'billing_v2',
      allowAllModules: true,
      includedModules: [],
    });

    await expect(makeGuard().canActivate(makeContext('/api/v1/orders') as never))
      .resolves
      .toBe(true);
  });

  it('continues to block raw past_due even when a future grace date exists', async () => {
    tenantBillingResolver.reconcileTenantBillingStatus.mockResolvedValue({
      subscriptionStatus: 'past_due',
      trialEndsAt: null,
      subscription: { gracePeriodEndsAt: new Date(Date.now() + 60_000) },
      source: 'billing_v2',
      allowAllModules: true,
      includedModules: [],
    });

    await expect(makeGuard().canActivate(makeContext('/api/v1/orders') as never))
      .rejects
      .toBeInstanceOf(ForbiddenException);
  });

  it('allows inventory only when the Billing V2 plan includes the module', async () => {
    reflector.getAllAndOverride.mockReturnValue('inventory');
    tenantBillingResolver.reconcileTenantBillingStatus.mockResolvedValue({
      subscriptionStatus: 'active',
      trialEndsAt: null,
      subscription: { gracePeriodEndsAt: null },
      source: 'billing_v2',
      allowAllModules: false,
      includedModules: ['inventory'],
    });

    await expect(makeGuard().canActivate(makeContext('/api/v1/inventory/ingredients') as never))
      .resolves
      .toBe(true);
  });

  it('keeps inventory blocked when the Billing V2 plan omits the module', async () => {
    reflector.getAllAndOverride.mockReturnValue('inventory');
    tenantBillingResolver.reconcileTenantBillingStatus.mockResolvedValue({
      subscriptionStatus: 'active',
      trialEndsAt: null,
      subscription: { gracePeriodEndsAt: null },
      source: 'billing_v2',
      allowAllModules: false,
      includedModules: [],
    });

    await expect(makeGuard().canActivate(makeContext('/api/v1/inventory/ingredients') as never))
      .rejects
      .toBeInstanceOf(ForbiddenException);
  });

  it('passes the verified tenant subject to feature resolution before route auth guards run', async () => {
    reflector.getAllAndOverride.mockReturnValue('ifood_marketplace');
    tenantBillingResolver.reconcileTenantBillingStatus.mockResolvedValue({
      subscriptionStatus: 'active',
      trialEndsAt: null,
      subscription: { gracePeriodEndsAt: null },
      source: 'billing_v2',
      allowAllModules: false,
      includedModules: [],
    });
    jwtService.verify.mockReturnValue({ type: 'tenant', tenantId: 'tenant-1', sub: 'tenant-user-1' });
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer signed-token' },
          method: 'POST',
          originalUrl: '/api/v1/marketplaces/ifood/connect/manual',
        }),
      }),
    };

    await expect(makeGuard().canActivate(context as never)).resolves.toBe(true);
    expect(featureControlService.resolveTenantFeature).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      featureKey: 'ifood_marketplace',
      userId: 'tenant-user-1',
    });
  });
});
