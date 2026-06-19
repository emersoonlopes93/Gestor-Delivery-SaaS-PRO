import { BadRequestException } from '@nestjs/common';
import { BillingController } from './billing.controller';

describe('BillingController Trial Pro', () => {
  const makeController = () => {
    const billingService = {};
    const tenantBillingResolver = {
      getDefaultBillingPlan: jest.fn().mockResolvedValue({
        id: 'plan-1',
        trialDays: 14,
        requiresPaymentMethod: true,
      }),
    };
    const billingUsageService = {};
    const tenantBillingPortalService = {
      getMyBillingOverview: jest.fn(),
    };
    const billingAddonService = {};
    const billingEntitlementsService = {};
    const billingSettingsService = {
      ensureDefaultSettings: jest.fn().mockResolvedValue({
        trialProEnabled: true,
      }),
    };
    const billingPaymentGatewayService = {
      getRuntimeConfig: jest.fn().mockReturnValue({
        paymentsEnabled: false,
      }),
    };
    const prisma = {
      billingPaymentMethod: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    return {
      controller: new BillingController(
        billingService as never,
        tenantBillingResolver as never,
        billingUsageService as never,
        tenantBillingPortalService as never,
        billingAddonService as never,
        billingEntitlementsService as never,
        billingSettingsService as never,
        billingPaymentGatewayService as never,
        prisma as never,
      ),
    };
  };

  it('blocks self-serve trial with a clear message when payment method flow is not ready', async () => {
    const { controller } = makeController();

    await expect(controller.startTrialPro('tenant-1')).rejects.toThrow(BadRequestException);
    await expect(controller.startTrialPro('tenant-1')).rejects.toThrow(
      'Trial Pro com cartao ainda nao esta pronto neste ambiente. Mantenha a flag desabilitada ate o gateway real estar disponivel.',
    );
  });
});
