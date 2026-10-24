import { Module } from '@nestjs/common';
import { PaymentCredentialService } from './payment-credential.service';
import { PaymentProviderConnectionService } from './payment-provider-connection.service';
import { OrderPaymentAttemptService } from './order-payment-attempt.service';
import { PaymentWebhookInboxService } from './payment-webhook-inbox.service';
import { PlatformFeePolicyService } from './platform-fee-policy.service';
import { PlatformFeeLifecycleService } from './platform-fee-lifecycle.service';
import { OnlinePaymentActivationService } from './online-payment-activation.service';

@Module({
  providers: [
    PaymentCredentialService,
    PaymentProviderConnectionService,
    OrderPaymentAttemptService,
    PaymentWebhookInboxService,
    PlatformFeePolicyService,
    PlatformFeeLifecycleService,
    OnlinePaymentActivationService,
  ],
  exports: [
    PaymentCredentialService,
    PaymentProviderConnectionService,
    OrderPaymentAttemptService,
    PaymentWebhookInboxService,
    PlatformFeePolicyService,
    PlatformFeeLifecycleService,
    OnlinePaymentActivationService,
  ],
})
export class PaymentFoundationModule {}
