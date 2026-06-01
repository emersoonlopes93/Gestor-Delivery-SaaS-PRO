import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BillingGatewayMode,
  Invoice,
  InvoiceStatus,
  PaymentAttempt,
  PaymentAttemptStatus,
  PaymentProvider,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BillingPaymentGatewayService } from './billing-payment-gateway.service';
import { BillingPaymentSimulation } from './billing-payment-gateway.interface';
import { mapAsaasPaymentStatusToAttemptStatus } from './asaas-billing-payment.provider';

const PENDING_ATTEMPT_STATUSES = [PaymentAttemptStatus.pending, PaymentAttemptStatus.processing];

export type CreateBillingPaymentAttemptInput = {
  invoiceId: string;
  tenantId: string;
  provider: PaymentProvider;
  mode: BillingGatewayMode;
  idempotencyKey?: string;
  simulate?: BillingPaymentSimulation;
};

@Injectable()
export class BillingPaymentAttemptService {
  private readonly logger = new Logger(BillingPaymentAttemptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayService: BillingPaymentGatewayService,
  ) {}

  async createAttemptForInvoice(input: CreateBillingPaymentAttemptInput): Promise<PaymentAttempt> {
    this.gatewayService.assertPaymentsEnabled(input.provider, input.mode);
    const idempotencyKey = this.resolveIdempotencyKey(input);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, tenantId: input.tenantId },
        include: { subscription: true },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice nao encontrada para o tenant informado.');
      }

      const existing = await tx.paymentAttempt.findFirst({
        where: {
          invoiceId: invoice.id,
          provider: input.provider,
          idempotencyKey,
        },
      });
      if (existing) return existing;

      this.assertInvoiceAllowsAttempt(invoice);

      const gatewayResult = await this.gatewayService.createPaymentForInvoice({
        invoice,
        provider: input.provider,
        mode: input.mode,
        idempotencyKey,
        providerCustomerId: invoice.subscription.providerCustomerId,
        simulate: input.simulate,
      });

      if (gatewayResult.providerCustomerId && !invoice.subscription.providerCustomerId) {
        await tx.tenantBillingSubscription.update({
          where: { id: invoice.subscriptionId },
          data: {
            provider: input.provider,
            providerCustomerId: gatewayResult.providerCustomerId,
          },
        });
      }

      const openedInvoice = await this.openInvoiceForAttempt(tx, invoice, gatewayResult.providerPaymentUrl, input.provider);
      const attempt = await tx.paymentAttempt.create({
        data: {
          invoiceId: openedInvoice.id,
          tenantId: openedInvoice.tenantId,
          provider: input.provider,
          mode: input.mode,
          idempotencyKey,
          status: gatewayResult.status,
          amount: openedInvoice.total,
          providerPaymentId: gatewayResult.providerPaymentId,
          errorCode: gatewayResult.errorCode,
          errorMessage: gatewayResult.errorMessage,
          metadataJson: gatewayResult.metadataJson,
          requestJson: gatewayResult.requestJson,
          responseJson: gatewayResult.responseJson,
        },
      });

      if (gatewayResult.status === PaymentAttemptStatus.succeeded) {
        await this.markInvoicePaid(tx, openedInvoice.id);
      }
      if (gatewayResult.status === PaymentAttemptStatus.failed) {
        await this.failInvoiceIfNoPendingAttempts(tx, openedInvoice.id);
      }

      await this.createBillingAuditLog(tx, {
        tenantId: openedInvoice.tenantId,
        action: input.provider === PaymentProvider.asaas ? 'billing.asaas_sandbox_charge_created' : 'billing.payment_attempt_created',
        details: {
          provider: input.provider,
          mode: input.mode,
          invoiceId: openedInvoice.id,
          paymentAttemptId: attempt.id,
          providerPaymentId: gatewayResult.providerPaymentId,
          providerCustomerId: gatewayResult.providerCustomerId ?? invoice.subscription.providerCustomerId ?? null,
          invoiceStatusBefore: invoice.status,
          invoiceStatusAfter: gatewayResult.status === PaymentAttemptStatus.succeeded ? InvoiceStatus.paid : openedInvoice.status,
          attemptStatus: gatewayResult.status,
          result: 'created',
        },
      });
      this.logger.log({
        message: 'billing_payment_attempt_created',
        provider: input.provider,
        mode: input.mode,
        tenantId: openedInvoice.tenantId,
        invoiceId: openedInvoice.id,
        paymentAttemptId: attempt.id,
        providerPaymentId: gatewayResult.providerPaymentId,
        transition: `${invoice.status}->${gatewayResult.status === PaymentAttemptStatus.succeeded ? InvoiceStatus.paid : openedInvoice.status}`,
        result: 'created',
      });

      return attempt;
    });
  }

  async listAttemptsForInvoice(invoiceId: string): Promise<PaymentAttempt[]> {
    return this.prisma.paymentAttempt.findMany({
      where: { invoiceId },
      orderBy: [{ attemptedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async markAttemptSucceeded(input: { attemptId: string; reason?: string }): Promise<PaymentAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await this.getAttemptWithInvoice(tx, input.attemptId);
      if (attempt.invoice.status === InvoiceStatus.void) {
        throw new BadRequestException('Invoice void nao pode ser marcada como paga.');
      }
      if (attempt.invoice.status === InvoiceStatus.paid && attempt.status === PaymentAttemptStatus.succeeded) {
        return attempt;
      }
      if (attempt.invoice.status === InvoiceStatus.paid) {
        throw new BadRequestException('Invoice paga nao pode receber nova transicao.');
      }

      const updated = await tx.paymentAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: PaymentAttemptStatus.succeeded,
          errorCode: null,
          errorMessage: null,
          metadataJson: this.mergeMetadata(attempt.metadataJson, {
            manualStatusReason: input.reason ?? 'marked_paid',
          }),
        },
      });
      await this.markInvoicePaid(tx, attempt.invoiceId);
      return updated;
    });
  }

  async markAttemptFailed(input: { attemptId: string; errorCode?: string; errorMessage?: string }): Promise<PaymentAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await this.getAttemptWithInvoice(tx, input.attemptId);
      if (attempt.invoice.status === InvoiceStatus.paid || attempt.invoice.status === InvoiceStatus.void) {
        throw new BadRequestException('Invoice paga ou void nao pode ser marcada como falha.');
      }

      const updated = await tx.paymentAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: PaymentAttemptStatus.failed,
          errorCode: input.errorCode ?? 'manual_failure',
          errorMessage: input.errorMessage ?? 'Payment attempt marcada como falha manualmente.',
          metadataJson: this.mergeMetadata(attempt.metadataJson, {
            manualStatusReason: 'marked_failed',
          }),
        },
      });
      await this.failInvoiceIfNoPendingAttempts(tx, attempt.invoiceId);
      return updated;
    });
  }

  async applyMockPaymentStatusWebhook(input: {
    eventId: string;
    providerPaymentId: string;
    status: 'succeeded' | 'failed' | 'pending';
  }): Promise<PaymentAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.findFirst({
        where: {
          provider: PaymentProvider.mock,
          providerPaymentId: input.providerPaymentId,
        },
        include: { invoice: true },
      });
      if (!attempt) {
        throw new NotFoundException('Payment attempt mock nao encontrada.');
      }

      const eventIds = this.readWebhookEventIds(attempt.metadataJson);
      if (eventIds.includes(input.eventId)) return attempt;

      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          metadataJson: this.mergeMetadata(attempt.metadataJson, {
            mockWebhookEventIds: [...eventIds, input.eventId],
          }),
        },
      });

      if (input.status === 'succeeded') {
        return this.markAttemptSucceededInTransaction(tx, attempt.id, `mock_webhook:${input.eventId}`);
      }
      if (input.status === 'failed') {
        return this.markAttemptFailedInTransaction(
          tx,
          attempt.id,
          'mock_webhook_failure',
          `Mock webhook ${input.eventId} marcou a tentativa como falha.`,
        );
      }

      return tx.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    });
  }

  async applyAsaasPaymentWebhook(input: {
    eventId: string;
    providerPaymentId: string;
    eventType: string;
    providerStatus: string;
  }): Promise<PaymentAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.paymentAttempt.findFirst({
        where: {
          provider: PaymentProvider.asaas,
          providerPaymentId: input.providerPaymentId,
        },
        include: { invoice: true },
      });
      if (!attempt) {
        throw new NotFoundException('Payment attempt Asaas nao encontrada para o providerPaymentId informado.');
      }

      const eventIds = this.readWebhookEventIds(attempt.metadataJson, 'asaasWebhookEventIds');
      if (eventIds.includes(input.eventId)) {
        this.logger.log({
          message: 'billing_asaas_webhook_idempotent',
          provider: PaymentProvider.asaas,
          mode: attempt.mode,
          tenantId: attempt.tenantId,
          invoiceId: attempt.invoiceId,
          paymentAttemptId: attempt.id,
          providerPaymentId: attempt.providerPaymentId,
          eventId: input.eventId,
          result: 'duplicate_ignored',
        });
        return attempt;
      }

      const status = mapAsaasPaymentStatusToAttemptStatus(input.providerStatus);
      const previousAttemptStatus = attempt.status;
      const previousInvoiceStatus = attempt.invoice.status;
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          metadataJson: this.mergeMetadata(attempt.metadataJson, {
            asaasWebhookEventIds: [...eventIds, input.eventId],
            asaasLastEventType: input.eventType,
            asaasLastProviderStatus: input.providerStatus,
          }),
        },
      });

      if (status === PaymentAttemptStatus.succeeded) {
        const updated = await this.markAttemptSucceededInTransaction(tx, attempt.id, `asaas_webhook:${input.eventId}`);
        await this.auditAsaasWebhook(tx, {
          attempt: updated,
          previousAttemptStatus,
          previousInvoiceStatus,
          eventId: input.eventId,
          eventType: input.eventType,
          providerStatus: input.providerStatus,
          nextAttemptStatus: updated.status,
          nextInvoiceStatus: InvoiceStatus.paid,
        });
        return updated;
      }
      if (status === PaymentAttemptStatus.failed) {
        const updated = await this.markAttemptFailedInTransaction(
          tx,
          attempt.id,
          'asaas_payment_failed',
          `Asaas webhook ${input.eventId} status ${input.providerStatus}.`,
        );
        const invoiceAfterFailure = await tx.invoice.findUniqueOrThrow({ where: { id: attempt.invoiceId } });
        await this.auditAsaasWebhook(tx, {
          attempt: updated,
          previousAttemptStatus,
          previousInvoiceStatus,
          eventId: input.eventId,
          eventType: input.eventType,
          providerStatus: input.providerStatus,
          nextAttemptStatus: updated.status,
          nextInvoiceStatus: invoiceAfterFailure.status,
        });
        return updated;
      }
      if (status === PaymentAttemptStatus.canceled) {
        const updated = await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: PaymentAttemptStatus.canceled,
            errorCode: 'asaas_payment_canceled',
            errorMessage: `Asaas webhook ${input.eventId} cancelou a cobranca.`,
          },
        });
        await this.failInvoiceIfNoPendingAttempts(tx, attempt.invoiceId);
        const invoiceAfterCancel = await tx.invoice.findUniqueOrThrow({ where: { id: attempt.invoiceId } });
        await this.auditAsaasWebhook(tx, {
          attempt: updated,
          previousAttemptStatus,
          previousInvoiceStatus,
          eventId: input.eventId,
          eventType: input.eventType,
          providerStatus: input.providerStatus,
          nextAttemptStatus: updated.status,
          nextInvoiceStatus: invoiceAfterCancel.status,
        });
        return updated;
      }

      const updated = await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status,
          errorCode: null,
          errorMessage: null,
        },
      });
      await this.auditAsaasWebhook(tx, {
        attempt: updated,
        previousAttemptStatus,
        previousInvoiceStatus,
        eventId: input.eventId,
        eventType: input.eventType,
        providerStatus: input.providerStatus,
        nextAttemptStatus: updated.status,
        nextInvoiceStatus: previousInvoiceStatus,
      });
      return updated;
    });
  }

  private resolveIdempotencyKey(input: CreateBillingPaymentAttemptInput): string {
    const trimmed = input.idempotencyKey?.trim();
    if (trimmed) return trimmed;
    return `invoice:${input.invoiceId}:provider:${input.provider}:mode:${input.mode}`;
  }

  private async auditAsaasWebhook(
    tx: Prisma.TransactionClient,
    input: {
      attempt: PaymentAttempt;
      previousAttemptStatus: PaymentAttemptStatus;
      previousInvoiceStatus: InvoiceStatus;
      eventId: string;
      eventType: string;
      providerStatus: string;
      nextAttemptStatus: PaymentAttemptStatus;
      nextInvoiceStatus: InvoiceStatus;
    },
  ): Promise<void> {
    await this.createBillingAuditLog(tx, {
      tenantId: input.attempt.tenantId,
      action: 'billing.asaas_sandbox_webhook_processed',
      details: {
        provider: PaymentProvider.asaas,
        mode: input.attempt.mode,
        invoiceId: input.attempt.invoiceId,
        paymentAttemptId: input.attempt.id,
        providerPaymentId: input.attempt.providerPaymentId,
        eventId: input.eventId,
        eventType: input.eventType,
        providerStatus: input.providerStatus,
        attemptStatusBefore: input.previousAttemptStatus,
        attemptStatusAfter: input.nextAttemptStatus,
        invoiceStatusBefore: input.previousInvoiceStatus,
        invoiceStatusAfter: input.nextInvoiceStatus,
        result: 'processed',
      },
    });

    if (input.nextInvoiceStatus !== input.previousInvoiceStatus) {
      await this.createBillingAuditLog(tx, {
        tenantId: input.attempt.tenantId,
        action: `billing.invoice_marked_${input.nextInvoiceStatus}`,
        details: {
          provider: PaymentProvider.asaas,
          mode: input.attempt.mode,
          invoiceId: input.attempt.invoiceId,
          paymentAttemptId: input.attempt.id,
          providerPaymentId: input.attempt.providerPaymentId,
          eventId: input.eventId,
          invoiceStatusBefore: input.previousInvoiceStatus,
          invoiceStatusAfter: input.nextInvoiceStatus,
          result: 'transitioned',
        },
      });
    }

    this.logger.log({
      message: 'billing_asaas_webhook_processed',
      provider: PaymentProvider.asaas,
      mode: input.attempt.mode,
      tenantId: input.attempt.tenantId,
      invoiceId: input.attempt.invoiceId,
      paymentAttemptId: input.attempt.id,
      providerPaymentId: input.attempt.providerPaymentId,
      eventId: input.eventId,
      transition: `${input.previousInvoiceStatus}->${input.nextInvoiceStatus}`,
      result: 'processed',
    });
  }

  private async createBillingAuditLog(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      action: string;
      details: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: null,
        userType: 'system',
        action: input.action,
        resource: 'billing',
        details: input.details,
      },
    });
  }

  private assertInvoiceAllowsAttempt(invoice: Invoice): void {
    if (invoice.status === InvoiceStatus.paid) {
      throw new BadRequestException('Invoice paga nao aceita nova tentativa de pagamento.');
    }
    if (invoice.status === InvoiceStatus.void) {
      throw new BadRequestException('Invoice void nao aceita tentativa de pagamento.');
    }
    if (invoice.status === InvoiceStatus.failed) {
      throw new BadRequestException('Invoice failed nao aceita nova tentativa sem reabertura explicita.');
    }
    if (![InvoiceStatus.draft, InvoiceStatus.open, InvoiceStatus.overdue].includes(invoice.status)) {
      throw new BadRequestException(`Status de invoice nao permite payment attempt: ${invoice.status}.`);
    }
  }

  private async openInvoiceForAttempt(
    tx: Prisma.TransactionClient,
    invoice: Invoice,
    providerPaymentUrl: string | null,
    provider: PaymentProvider,
  ): Promise<Invoice> {
    if (invoice.status === InvoiceStatus.open || invoice.status === InvoiceStatus.overdue) {
      return tx.invoice.update({
        where: { id: invoice.id },
        data: {
          provider,
          providerPaymentUrl,
        },
      });
    }

    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.open,
        openedAt: invoice.openedAt ?? new Date(),
        failedAt: null,
        provider,
        providerPaymentUrl,
      },
    });
  }

  private async markInvoicePaid(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.paid,
        paidAt: new Date(),
        failedAt: null,
      },
    });
  }

  private async failInvoiceIfNoPendingAttempts(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
    const pendingAttempts = await tx.paymentAttempt.count({
      where: {
        invoiceId,
        status: { in: PENDING_ATTEMPT_STATUSES },
      },
    });
    if (pendingAttempts > 0) return;

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.failed,
        failedAt: new Date(),
      },
    });
  }

  private async getAttemptWithInvoice(tx: Prisma.TransactionClient, attemptId: string) {
    const attempt = await tx.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: { invoice: true },
    });
    if (!attempt) {
      throw new NotFoundException('Payment attempt nao encontrada.');
    }
    return attempt;
  }

  private async markAttemptSucceededInTransaction(
    tx: Prisma.TransactionClient,
    attemptId: string,
    reason: string,
  ): Promise<PaymentAttempt> {
    const attempt = await this.getAttemptWithInvoice(tx, attemptId);
    if (attempt.invoice.status === InvoiceStatus.void) {
      throw new BadRequestException('Invoice void nao pode ser marcada como paga.');
    }
    if (attempt.invoice.status === InvoiceStatus.paid && attempt.status === PaymentAttemptStatus.succeeded) {
      return attempt;
    }
    if (attempt.invoice.status === InvoiceStatus.paid) {
      throw new BadRequestException('Invoice paga nao pode receber nova transicao.');
    }

    const updated = await tx.paymentAttempt.update({
      where: { id: attemptId },
      data: {
        status: PaymentAttemptStatus.succeeded,
        errorCode: null,
        errorMessage: null,
        metadataJson: this.mergeMetadata(attempt.metadataJson, {
          manualStatusReason: reason,
        }),
      },
    });
    await this.markInvoicePaid(tx, attempt.invoiceId);
    return updated;
  }

  private async markAttemptFailedInTransaction(
    tx: Prisma.TransactionClient,
    attemptId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<PaymentAttempt> {
    const attempt = await this.getAttemptWithInvoice(tx, attemptId);
    if (attempt.invoice.status === InvoiceStatus.paid || attempt.invoice.status === InvoiceStatus.void) {
      throw new BadRequestException('Invoice paga ou void nao pode ser marcada como falha.');
    }

    const updated = await tx.paymentAttempt.update({
      where: { id: attemptId },
      data: {
        status: PaymentAttemptStatus.failed,
        errorCode,
        errorMessage,
        metadataJson: this.mergeMetadata(attempt.metadataJson, {
          manualStatusReason: 'marked_failed',
        }),
      },
    });
    await this.failInvoiceIfNoPendingAttempts(tx, attempt.invoiceId);
    return updated;
  }

  private mergeMetadata(
    metadata: Prisma.JsonValue | null,
    extra: Prisma.InputJsonObject,
  ): Prisma.InputJsonObject {
    const current = this.isJsonObject(metadata) ? metadata : {};
    return {
      ...current,
      ...extra,
    };
  }

  private readWebhookEventIds(metadata: Prisma.JsonValue | null, key = 'mockWebhookEventIds'): string[] {
    if (!this.isJsonObject(metadata)) return [];
    const value = metadata[key];
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  private isJsonObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
