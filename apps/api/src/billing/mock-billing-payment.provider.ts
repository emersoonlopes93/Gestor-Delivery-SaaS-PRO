import { Injectable } from '@nestjs/common';
import { PaymentAttemptStatus, PaymentProvider } from '@prisma/client';
import {
  BillingPaymentCreateInput,
  BillingPaymentCreateResult,
  BillingPaymentGateway,
} from './billing-payment-gateway.interface';

@Injectable()
export class MockBillingPaymentProvider implements BillingPaymentGateway {
  readonly provider = PaymentProvider.mock;

  async createPaymentForInvoice(input: BillingPaymentCreateInput): Promise<BillingPaymentCreateResult> {
    const status = this.resolveStatus(input.simulate);
    const providerPaymentId = `mock_pay_${input.invoice.id.slice(0, 8)}_${input.idempotencyKey.slice(0, 12)}`;

    return {
      provider: this.provider,
      mode: input.mode,
      status,
      providerPaymentId,
      providerPaymentUrl: null,
      errorCode: status === PaymentAttemptStatus.failed ? 'mock_failure' : null,
      errorMessage: status === PaymentAttemptStatus.failed ? 'Mock sandbox payment failure.' : null,
      metadataJson: {
        kind: 'mock',
        simulation: input.simulate ?? 'pending',
        note: 'Mock provider is local-only and never contacts a gateway.',
      },
      requestJson: {
        invoiceId: input.invoice.id,
        idempotencyKey: input.idempotencyKey,
        amount: input.invoice.total.toFixed(2),
        currency: input.invoice.currency,
        simulate: input.simulate ?? 'pending',
      },
      responseJson: {
        providerPaymentId,
        status,
        paymentUrl: null,
      },
    };
  }

  async getPaymentStatus(): Promise<PaymentAttemptStatus> {
    return PaymentAttemptStatus.pending;
  }

  private resolveStatus(simulate: BillingPaymentCreateInput['simulate']): PaymentAttemptStatus {
    if (simulate === 'success') return PaymentAttemptStatus.succeeded;
    if (simulate === 'failure') return PaymentAttemptStatus.failed;
    return PaymentAttemptStatus.pending;
  }
}
