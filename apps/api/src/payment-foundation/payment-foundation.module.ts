import { Module } from '@nestjs/common';
import { PaymentCredentialService } from './payment-credential.service';
import { PaymentProviderConnectionService } from './payment-provider-connection.service';
import { OrderPaymentAttemptService } from './order-payment-attempt.service';
import { PaymentWebhookInboxService } from './payment-webhook-inbox.service';

@Module({
  providers: [
    PaymentCredentialService,
    PaymentProviderConnectionService,
    OrderPaymentAttemptService,
    PaymentWebhookInboxService,
  ],
  exports: [
    PaymentCredentialService,
    PaymentProviderConnectionService,
    OrderPaymentAttemptService,
    PaymentWebhookInboxService,
  ],
})
export class PaymentFoundationModule {}
