import {
  BillingGatewayMode,
  Invoice,
  PaymentAttemptStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';

export type BillingPaymentSimulation = 'success' | 'failure' | 'pending';

export type BillingPaymentCreateInput = {
  invoice: Invoice;
  provider: PaymentProvider;
  mode: BillingGatewayMode;
  idempotencyKey: string;
  simulate?: BillingPaymentSimulation;
};

export type BillingPaymentCreateResult = {
  provider: PaymentProvider;
  mode: BillingGatewayMode;
  status: PaymentAttemptStatus;
  providerPaymentId: string | null;
  providerPaymentUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadataJson: Prisma.InputJsonObject;
  requestJson: Prisma.InputJsonObject;
  responseJson: Prisma.InputJsonObject;
};

export interface BillingPaymentGateway {
  readonly provider: PaymentProvider;
  createPaymentForInvoice(input: BillingPaymentCreateInput): Promise<BillingPaymentCreateResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentAttemptStatus>;
  cancel?(providerPaymentId: string): Promise<void>;
}
