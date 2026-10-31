import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentRefund, PaymentRefundStatus, PaymentTxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { MercadoPagoRefundClient, MercadoPagoRefundResult } from './mercadopago-refund.client';

const ACTIVE_REFUND_STATUSES: PaymentRefundStatus[] = [
  PaymentRefundStatus.REQUESTED,
  PaymentRefundStatus.PROCESSING,
  PaymentRefundStatus.UNKNOWN,
];

type RefundRequest = {
  tenantId: string;
  orderId: string;
  paymentTransactionId: string;
  idempotencyKey: string;
};

@Injectable()
export class PaymentRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPagoRefundClient: MercadoPagoRefundClient,
  ) {}

  async requestFullRefund(input: RefundRequest): Promise<PaymentRefund> {
    if (!input.idempotencyKey.trim()) {
      throw new BadRequestException('A stable refund idempotency key is required.');
    }

    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: {
        id: input.paymentTransactionId,
        tenantId: input.tenantId,
        orderId: input.orderId,
        status: PaymentTxStatus.confirmed,
        gatewayName: 'mercadopago',
      },
      select: {
        id: true,
        tenantId: true,
        orderId: true,
        gatewayTxId: true,
        amount: true,
      },
    });
    if (!transaction || !transaction.orderId) {
      throw new NotFoundException('Confirmed Mercado Pago payment for this order was not found.');
    }
    if (!transaction.gatewayTxId) {
      throw new BadRequestException('Confirmed Mercado Pago payment has no provider payment identifier.');
    }

    const existingSucceeded = await this.prisma.paymentRefund.findFirst({
      where: {
        tenantId: input.tenantId,
        paymentTransactionId: transaction.id,
        status: PaymentRefundStatus.SUCCEEDED,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingSucceeded) return existingSucceeded;

    let refund = await this.prisma.paymentRefund.findUnique({
      where: {
        tenantId_paymentTransactionId_idempotencyKey: {
          tenantId: input.tenantId,
          paymentTransactionId: transaction.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });

    if (!refund) {
      try {
        refund = await this.prisma.paymentRefund.create({
          data: {
            tenantId: input.tenantId,
            orderId: transaction.orderId,
            paymentTransactionId: transaction.id,
            provider: 'mercadopago',
            providerPaymentId: transaction.gatewayTxId,
            amount: transaction.amount,
            idempotencyKey: input.idempotencyKey,
          },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        refund = await this.prisma.paymentRefund.findUnique({
          where: {
            tenantId_paymentTransactionId_idempotencyKey: {
              tenantId: input.tenantId,
              paymentTransactionId: transaction.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (!refund) throw error;
      }
    }

    const claimed = await this.prisma.paymentRefund.updateMany({
      where: {
        id: refund.id,
        tenantId: input.tenantId,
        status: { in: [PaymentRefundStatus.REQUESTED, PaymentRefundStatus.UNKNOWN] },
      },
      data: {
        status: PaymentRefundStatus.PROCESSING,
        processedAt: new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });
    if (claimed.count !== 1) return this.getRefund(input.tenantId, refund.id);

    const providerResult = await this.mercadoPagoRefundClient.refundPayment({
      tenantId: input.tenantId,
      providerPaymentId: refund.providerPaymentId,
      idempotencyKey: refund.idempotencyKey,
    });
    return this.persistProviderResult(input.tenantId, refund.id, providerResult);
  }

  async getRefund(tenantId: string, refundId: string): Promise<PaymentRefund> {
    const refund = await this.prisma.paymentRefund.findFirst({ where: { id: refundId, tenantId } });
    if (!refund) throw new NotFoundException('Payment refund not found.');
    return refund;
  }

  async reconcileRefund(tenantId: string, refundId: string): Promise<PaymentRefund> {
    const refund = await this.getRefund(tenantId, refundId);
    if (!ACTIVE_REFUND_STATUSES.includes(refund.status) || !refund.providerRefundId) return refund;

    const providerResult = await this.mercadoPagoRefundClient.getRefundStatus({
      tenantId,
      providerPaymentId: refund.providerPaymentId,
      providerRefundId: refund.providerRefundId,
    });
    return this.persistProviderResult(tenantId, refund.id, providerResult);
  }

  async confirmFullRefundFromPaymentWebhook(input: {
    tenantId: string;
    paymentTransactionId: string;
    providerPaymentId: string;
  }): Promise<boolean> {
    const candidate = await this.prisma.paymentRefund.findFirst({
      where: {
        tenantId: input.tenantId,
        paymentTransactionId: input.paymentTransactionId,
        provider: 'mercadopago',
        providerPaymentId: input.providerPaymentId,
        status: { in: ACTIVE_REFUND_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!candidate) return false;

    const confirmed = await this.prisma.paymentRefund.updateMany({
      where: {
        id: candidate.id,
        tenantId: input.tenantId,
        status: { in: ACTIVE_REFUND_STATUSES },
      },
      data: {
        status: PaymentRefundStatus.SUCCEEDED,
        confirmedAt: new Date(),
        providerStatus: 'refunded',
        failureCode: null,
        failureMessage: null,
      },
    });
    return confirmed.count === 1;
  }

  private async persistProviderResult(
    tenantId: string,
    refundId: string,
    result: MercadoPagoRefundResult,
  ): Promise<PaymentRefund> {
    const now = new Date();
    const status = this.statusFromProviderOutcome(result.outcome);
    const updated = await this.prisma.paymentRefund.updateMany({
      where: {
        id: refundId,
        tenantId,
        status: { in: ACTIVE_REFUND_STATUSES },
      },
      data: {
        status,
        providerRefundId: result.providerRefundId ?? undefined,
        providerStatus: result.providerStatus,
        confirmedAt: status === PaymentRefundStatus.SUCCEEDED ? now : undefined,
        failedAt: status === PaymentRefundStatus.FAILED ? now : undefined,
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
      },
    });
    if (updated.count !== 1) return this.getRefund(tenantId, refundId);
    return this.getRefund(tenantId, refundId);
  }

  private statusFromProviderOutcome(outcome: MercadoPagoRefundResult['outcome']): PaymentRefundStatus {
    switch (outcome) {
      case 'SUCCEEDED': return PaymentRefundStatus.SUCCEEDED;
      case 'PROCESSING': return PaymentRefundStatus.PROCESSING;
      case 'FAILED': return PaymentRefundStatus.FAILED;
      case 'UNKNOWN': return PaymentRefundStatus.UNKNOWN;
    }
  }
}
