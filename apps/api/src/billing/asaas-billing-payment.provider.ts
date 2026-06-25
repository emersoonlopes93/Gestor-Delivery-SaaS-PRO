import { BadRequestException, Injectable } from '@nestjs/common';
import { BillingGatewayMode, PaymentAttemptStatus, PaymentProvider } from '@prisma/client';
import {
  AsaasBillingClientService,
  AsaasBillingCustomerResponse,
  AsaasBillingPaymentResponse,
} from './asaas-billing-client.service';
import {
  BillingPaymentCreateInput,
  BillingPaymentCreateResult,
  BillingPaymentGateway,
} from './billing-payment-gateway.interface';

@Injectable()
export class AsaasBillingPaymentProvider implements BillingPaymentGateway {
  readonly provider = PaymentProvider.asaas;

  constructor(private readonly asaasClient: AsaasBillingClientService) {}

  async createPaymentForInvoice(input: BillingPaymentCreateInput): Promise<BillingPaymentCreateResult> {
    if (input.mode !== BillingGatewayMode.sandbox) {
      throw new BadRequestException('Asaas billing SaaS esta liberado somente em sandbox nesta fase.');
    }

    const customerExternalReference = `tenant:${input.invoice.tenantId}:subscription:${input.invoice.subscriptionId}`;
    const customerRequest = {
      name: `Tenant ${input.invoice.tenantId.slice(0, 8)}`,
      cpfCnpj: this.syntheticCpfCnpj(input.invoice.tenantId),
      externalReference: customerExternalReference,
      notificationDisabled: true,
    };
    const existingProviderCustomerId = input.providerCustomerId?.trim();
    const customerResolution = existingProviderCustomerId
      ? { customer: { id: existingProviderCustomerId }, source: 'stored' as const }
      : await this.findOrCreateCustomer(customerRequest);
    const customer = customerResolution.customer;

    const paymentRequest = {
      customer: customer.id,
      billingType: 'UNDEFINED' as const,
      value: Number(input.invoice.total),
      dueDate: this.formatDate(input.invoice.dueDate),
      description: `PedeHub SaaS invoice ${input.invoice.number}`,
      externalReference: input.idempotencyKey,
    };
    const payment = await this.asaasClient.createPayment(paymentRequest);
    const status = mapAsaasPaymentStatusToAttemptStatus(payment.status);
    const providerPaymentUrl = this.resolvePaymentUrl(payment);

    return {
      provider: this.provider,
      mode: input.mode,
      status,
      providerPaymentId: payment.id,
      providerPaymentUrl,
      providerCustomerId: customer.id,
      errorCode: null,
      errorMessage: null,
      metadataJson: {
        kind: 'asaas_billing_saas',
        providerStatus: payment.status,
        customerId: customer.id,
        customerExternalReference,
        customerSource: customerResolution.source,
        customerReused: customerResolution.source !== 'created',
        sandboxOnly: true,
      },
      requestJson: {
        customer: customer.id,
        billingType: paymentRequest.billingType,
        value: paymentRequest.value,
        dueDate: paymentRequest.dueDate,
        description: paymentRequest.description,
        externalReference: paymentRequest.externalReference,
      },
      responseJson: this.safePaymentResponse(payment),
    };
  }

  async getPaymentStatus(): Promise<PaymentAttemptStatus> {
    return PaymentAttemptStatus.pending;
  }

  private resolvePaymentUrl(payment: AsaasBillingPaymentResponse): string | null {
    return payment.invoiceUrl ?? payment.bankSlipUrl ?? payment.paymentLink ?? null;
  }

  private async findOrCreateCustomer(customerRequest: {
    name: string;
    cpfCnpj: string;
    externalReference: string;
    notificationDisabled: boolean;
  }): Promise<{
    customer: AsaasBillingCustomerResponse;
    source: 'external_reference' | 'created';
  }> {
    const existing = await this.asaasClient.findCustomerByExternalReference(customerRequest.externalReference);
    if (existing) return { customer: existing, source: 'external_reference' };
    return { customer: await this.asaasClient.createCustomer(customerRequest), source: 'created' };
  }

  private safePaymentResponse(payment: AsaasBillingPaymentResponse) {
    return {
      id: payment.id,
      status: payment.status,
      invoiceUrl: payment.invoiceUrl ?? null,
      bankSlipUrl: payment.bankSlipUrl ?? null,
      paymentLink: payment.paymentLink ?? null,
      value: payment.value ?? null,
      dueDate: payment.dueDate ?? null,
      externalReference: payment.externalReference ?? null,
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private syntheticCpfCnpj(seed: string): string {
    const digits = Array.from(seed).map((char) => char.charCodeAt(0) % 10).join('');
    return `${digits}00000000000`.slice(0, 11);
  }
}

export function mapAsaasPaymentStatusToAttemptStatus(status: string): PaymentAttemptStatus {
  const normalized = status.trim().toUpperCase();
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(normalized)) {
    return PaymentAttemptStatus.succeeded;
  }
  if ([
    'OVERDUE',
    'REFUNDED',
    'REFUND_REQUESTED',
    'CHARGEBACK_REQUESTED',
    'CHARGEBACK_DISPUTE',
    'AWAITING_CHARGEBACK_REVERSAL',
  ].includes(normalized)) {
    return PaymentAttemptStatus.failed;
  }
  if (['DELETED', 'CANCELLED'].includes(normalized)) {
    return PaymentAttemptStatus.canceled;
  }
  if (['PENDING', 'AWAITING_RISK_ANALYSIS', 'APPROVED_BY_RISK_ANALYSIS', 'AUTHORIZED'].includes(normalized)) {
    return PaymentAttemptStatus.pending;
  }
  return PaymentAttemptStatus.processing;
}
