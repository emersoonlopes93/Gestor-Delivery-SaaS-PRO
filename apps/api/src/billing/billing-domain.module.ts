import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { BillingPlansService } from './billing-plans.service';
import { BillingSettingsService } from './billing-settings.service';
import { BillingSubscriptionLifecycleService } from './billing-subscription-lifecycle.service';
import { BillingRatingService } from './billing-rating.service';
import { BillingUsageService } from './billing-usage.service';
import { InvoiceService } from './invoice.service';
import { BillingCycleService } from './billing-cycle.service';
import { BillingPaymentGatewayService } from './billing-payment-gateway.service';
import { ManualBillingPaymentProvider } from './manual-billing-payment.provider';
import { MockBillingPaymentProvider } from './mock-billing-payment.provider';
import { BillingPaymentAttemptService } from './billing-payment-attempt.service';
import { AsaasBillingClientService } from './asaas-billing-client.service';
import { AsaasBillingPaymentProvider } from './asaas-billing-payment.provider';
import { TenantBillingResolverService } from './tenant-billing-resolver.service';
import { TenantBillingPortalService } from './tenant-billing-portal.service';
import { RevenueLedgerService } from './revenue-ledger.service';
import { BillingAddonService } from './billing-addon.service';
import { BillingEntitlementsService } from './billing-entitlements.service';
import { BillingRecurringAutomationService } from './billing-recurring-automation.service';
import { BillingRecurringAutomationProcessor } from './billing-recurring-automation.processor';
import { BILLING_AUTOMATION_QUEUE, isBillingAutomationQueueEnabled } from './billing-automation.constants';

const enableBillingAutomationQueue = isBillingAutomationQueueEnabled();

@Module({
  imports: [
    ...(enableBillingAutomationQueue
      ? [BullModule.registerQueue({
          name: BILLING_AUTOMATION_QUEUE,
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 1_000,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
          },
        })]
      : []),
  ],
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
    ManualBillingPaymentProvider,
    MockBillingPaymentProvider,
    AsaasBillingClientService,
    AsaasBillingPaymentProvider,
    BillingPaymentGatewayService,
    BillingPaymentAttemptService,
    TenantBillingResolverService,
    TenantBillingPortalService,
    RevenueLedgerService,
    BillingAddonService,
    BillingEntitlementsService,
    BillingRecurringAutomationService,
    ...(enableBillingAutomationQueue ? [BillingRecurringAutomationProcessor] : []),
  ],
  exports: [
    BillingPlansService,
    BillingSettingsService,
    BillingSubscriptionLifecycleService,
    BillingRatingService,
    BillingUsageService,
    InvoiceService,
    BillingCycleService,
    BillingPaymentGatewayService,
    BillingPaymentAttemptService,
    TenantBillingResolverService,
    TenantBillingPortalService,
    RevenueLedgerService,
    BillingAddonService,
    BillingEntitlementsService,
    AsaasBillingClientService,
    BillingRecurringAutomationService,
  ],
})
export class BillingDomainModule {}
