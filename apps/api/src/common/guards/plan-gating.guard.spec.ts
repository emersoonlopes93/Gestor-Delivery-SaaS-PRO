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

  const makeGuard = () =>
    new PlanGatingGuard(
      reflector as never,
      billingService as never,
      tenantBillingResolver as never,
      jwtService as never,
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
});
