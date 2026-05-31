import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { BillingPlansService } from './billing-plans.service';
import { BillingSettingsService } from './billing-settings.service';
import { BillingSubscriptionLifecycleService } from './billing-subscription-lifecycle.service';
import { BillingRatingService } from './billing-rating.service';
import { BillingUsageService } from './billing-usage.service';
import { InvoiceService } from './invoice.service';
import { BillingCycleService } from './billing-cycle.service';

@Module({
  providers: [
    PrismaService,
    TenantContextService,
    BillingPlansService,
    BillingSettingsService,
    BillingSubscriptionLifecycleService,
    BillingRatingService,
    BillingUsageService,
    InvoiceService,
    BillingCycleService,
  ],
  exports: [
    BillingPlansService,
    BillingSettingsService,
    BillingSubscriptionLifecycleService,
    BillingRatingService,
    BillingUsageService,
    InvoiceService,
    BillingCycleService,
  ],
})
export class BillingDomainModule {}
