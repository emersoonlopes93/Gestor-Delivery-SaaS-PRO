import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BillingSettings } from '@prisma/client';

const DEFAULT_BILLING_SETTINGS_ID = 'global';

@Injectable()
export class BillingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDefaultSettings(): Promise<BillingSettings | null> {
    return this.prisma.billingSettings.findUnique({
      where: { id: DEFAULT_BILLING_SETTINGS_ID },
    });
  }

  async ensureDefaultSettings(): Promise<BillingSettings> {
    const defaults = {
      id: DEFAULT_BILLING_SETTINGS_ID,
      includeDeliveryFeeByDefault: false,
      includeServiceFeeByDefault: false,
      countStorefrontOrders: true,
      countPosOrders: true,
      countWhatsappAiOrders: true,
      countManualOrders: false,
      countConfirmedOrders: true,
      countCompletedOrders: true,
      excludeCancelledOrders: true,
      discountReducesRevenue: true,
      defaultGracePeriodDays: 7,
      defaultTrialDays: 7,
      requirePaymentMethodForPaidPlans: false,
    };

    return this.prisma.billingSettings.upsert({
      where: { id: DEFAULT_BILLING_SETTINGS_ID },
      update: defaults,
      create: defaults,
    });
  }
}
