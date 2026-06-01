import { Injectable } from '@nestjs/common';
import { PaymentAttemptStatus, PaymentProvider } from '@prisma/client';
import {
  BillingPaymentCreateInput,
  BillingPaymentCreateResult,
  BillingPaymentGateway,
} from './billing-payment-gateway.interface';

@Injectable()
export class ManualBillingPaymentProvider implements BillingPaymentGateway {
  readonly provider = PaymentProvider.manual;

  async createPaymentForInvoice(input: BillingPaymentCreateInput): Promise<BillingPaymentCreateResult> {
    return {
      provider: this.provider,
      mode: input.mode,
      status: PaymentAttemptStatus.pending,
      providerPaymentId: null,
      providerPaymentUrl: null,
      errorCode: null,
      errorMessage: null,
      metadataJson: {
        kind: 'manual',
        note: 'Manual provider never calls an external gateway.',
      },
      requestJson: {
        invoiceId: input.invoice.id,
        idempotencyKey: input.idempotencyKey,
        amount: input.invoice.total.toFixed(2),
        currency: input.invoice.currency,
      },
      responseJson: {
        status: PaymentAttemptStatus.pending,
        paymentUrl: null,
      },
    };
  }

  async getPaymentStatus(): Promise<PaymentAttemptStatus> {
    return PaymentAttemptStatus.pending;
  }
}
