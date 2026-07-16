import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  MarketplaceConnectionStatus,
  MarketplaceDivergenceType,
  MarketplaceOperation,
  MarketplaceOperationStatus,
  MarketplaceOperationType,
  MarketplaceProvider,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { FeatureControlService } from '../../feature-control/feature-control.service';
import { ConfigService } from '@nestjs/config';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';
import { IfoodApiError } from '../providers/ifood-api.error';
import { MarketplaceProviderRegistryService } from './marketplace-provider-registry.service';
import { MarketplaceDivergenceService } from './marketplace-divergence.service';

export type MarketplaceStatusJob = {
  tenantId: string;
  orderId: string;
  externalOrderId: string;
  operation: MarketplaceOperationType;
  correlationId: string;
  payloadVersion: 1;
  operationId: string;
};

@Injectable()
export class MarketplaceStatusSyncService {
  private readonly logger = new Logger(MarketplaceStatusSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: MarketplaceProviderRegistryService,
    private readonly featureControl: FeatureControlService,
    private readonly config: ConfigService,
    private readonly divergenceService: MarketplaceDivergenceService,
    @Optional() @InjectQueue(MARKETPLACE_EVENT_QUEUE) private readonly queue?: Queue,
  ) {}

  async handleInternalStatusChanged(input: {
    tenantId: string;
    orderId: string;
    status: string;
    reason?: string | null;
  }): Promise<{ deferred: boolean; operationId?: string }> {
    if (!['confirmed', 'cancelled'].includes(input.status)) return { deferred: false };

    const marketplaceOrder = await this.prisma.marketplaceOrder.findFirst({
      where: { tenantId: input.tenantId, internalOrderId: input.orderId },
      include: { connection: true },
    });
    if (!marketplaceOrder) return { deferred: false };
    if (this.config.get<string>('MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED') !== 'true') {
      throw new ServiceUnavailableException('Bidirectional iFood operations are disabled in this environment.');
    }
    if (marketplaceOrder.provider !== MarketplaceProvider.IFOOD) {
      throw new BadRequestException('Bidirectional status sync is only supported for iFood.');
    }
    const capability = await this.featureControl.resolveTenantFeature({
      tenantId: input.tenantId,
      featureKey: 'ifood_marketplace',
    });
    if (!capability.enabled) throw new BadRequestException('iFood marketplace feature is disabled for this tenant.');
    if (marketplaceOrder.connection.status !== MarketplaceConnectionStatus.CONNECTED) {
      throw new ServiceUnavailableException('iFood connection is not operational.');
    }
    if (!this.queue) {
      await this.divergenceService.record({
        tenantId: input.tenantId,
        marketplaceOrderId: marketplaceOrder.id,
        internalOrderId: marketplaceOrder.internalOrderId,
        provider: marketplaceOrder.provider,
        externalOrderId: marketplaceOrder.externalOrderId,
        type: MarketplaceDivergenceType.EVENT_MISSING,
        localState: marketplaceOrder.statusInternal,
        remoteState: marketplaceOrder.statusExternal,
        reason: 'BullMQ is unavailable during a marketplace status operation.',
        recommendedAction: 'Restore the worker and reconcile the remote order before retrying.',
        correlationId: randomUUID(),
      });
      throw new ServiceUnavailableException('BullMQ is required for bidirectional iFood operations.');
    }

    const operation = input.status === 'confirmed'
      ? MarketplaceOperationType.CONFIRM
      : MarketplaceOperationType.CANCEL;
    const reason = input.reason?.trim() || null;
    if (operation === MarketplaceOperationType.CANCEL && !reason) {
      throw new BadRequestException('An iFood cancellation reason code is required.');
    }

    const reasonFingerprint = reason
      ? createHash('sha256').update(reason).digest('hex').slice(0, 12)
      : 'v1';
    const idempotencyKey = `ifood:${operation.toLowerCase()}:${marketplaceOrder.id}:${reasonFingerprint}`;
    const activeOperation = await this.prisma.marketplaceOperation.findFirst({
      where: {
        tenantId: input.tenantId,
        marketplaceOrderId: marketplaceOrder.id,
        status: {
          in: [
            MarketplaceOperationStatus.PENDING,
            MarketplaceOperationStatus.QUEUED,
            MarketplaceOperationStatus.PROCESSING,
            MarketplaceOperationStatus.ACCEPTED,
          ],
        },
      },
    });
    if (activeOperation && activeOperation.idempotencyKey !== idempotencyKey) {
      throw new BadRequestException('Another iFood status operation is still pending for this order.');
    }
    if (activeOperation && activeOperation.status !== MarketplaceOperationStatus.PENDING) {
      return { deferred: true, operationId: activeOperation.id };
    }
    const correlationId = randomUUID();
    let record: MarketplaceOperation;
    try {
      record = await this.prisma.marketplaceOperation.create({
        data: {
          tenantId: input.tenantId,
          connectionId: marketplaceOrder.connectionId,
          marketplaceOrderId: marketplaceOrder.id,
          provider: marketplaceOrder.provider,
          externalOrderId: marketplaceOrder.externalOrderId,
          operation,
          idempotencyKey,
          cancellationReason: reason,
          correlationId,
          deadlineAt: operation === MarketplaceOperationType.CONFIRM
            ? marketplaceOrder.confirmationDeadlineAt
            : null,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      record = await this.prisma.marketplaceOperation.findFirstOrThrow({
        where: { tenantId: input.tenantId, idempotencyKey },
      });
    }

    if (record.status === MarketplaceOperationStatus.ACCEPTED || record.status === MarketplaceOperationStatus.SUCCEEDED) {
      return { deferred: true, operationId: record.id };
    }

    const job: MarketplaceStatusJob = {
      tenantId: input.tenantId,
      orderId: input.orderId,
      externalOrderId: marketplaceOrder.externalOrderId,
      operation,
      correlationId: record.correlationId,
      payloadVersion: 1,
      operationId: record.id,
    };
    const jobId = `ifood-${operation.toLowerCase()}-${input.tenantId}-${marketplaceOrder.id}-${reasonFingerprint}`;
    const enqueuedAt = new Date();
    await this.queue.add('order-status-sync', job, {
      jobId,
      attempts: 3,
      backoff: { type: 'ifood-retry-after', delay: 5000 },
    });
    await this.prisma.marketplaceOperation.update({
      where: { id: record.id, tenantId: input.tenantId },
      data: { status: MarketplaceOperationStatus.QUEUED, lastError: null, enqueuedAt },
    });
    return { deferred: true, operationId: record.id };
  }

  async getCancellationReasons(tenantId: string, marketplaceOrderId: string) {
    const marketplaceOrder = await this.prisma.marketplaceOrder.findFirst({
      where: { id: marketplaceOrderId, tenantId, provider: MarketplaceProvider.IFOOD },
      include: { connection: true },
    });
    if (!marketplaceOrder) throw new BadRequestException('iFood marketplace order not found.');
    if (this.config.get<string>('MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED') !== 'true') {
      throw new ServiceUnavailableException('Bidirectional iFood operations are disabled in this environment.');
    }
    const capability = await this.featureControl.resolveTenantFeature({ tenantId, featureKey: 'ifood_marketplace' });
    if (!capability.enabled) throw new BadRequestException('iFood marketplace feature is disabled for this tenant.');
    if (marketplaceOrder.connection.status !== MarketplaceConnectionStatus.CONNECTED) {
      throw new ServiceUnavailableException('iFood connection is not operational.');
    }
    const provider = this.providerRegistry.get(MarketplaceProvider.IFOOD);
    if (!provider.getCancellationReasons) throw new ServiceUnavailableException('iFood cancellation reasons are unavailable.');
    return provider.getCancellationReasons({
      connection: marketplaceOrder.connection,
      externalOrderId: marketplaceOrder.externalOrderId,
      correlationId: randomUUID(),
    });
  }

  async processStatusSyncJob(input: MarketplaceStatusJob, jobId?: string) {
    const startedAt = Date.now();
    const record = await this.prisma.marketplaceOperation.findFirst({
      where: { id: input.operationId, tenantId: input.tenantId },
      include: { connection: true, marketplaceOrder: true },
    });
    if (!record
      || record.marketplaceOrder.internalOrderId !== input.orderId
      || record.externalOrderId !== input.externalOrderId
      || record.operation !== input.operation
      || record.correlationId !== input.correlationId
      || input.payloadVersion !== 1) {
      throw new BadRequestException('Invalid or cross-tenant marketplace operation job.');
    }
    if (record.status === MarketplaceOperationStatus.ACCEPTED || record.status === MarketplaceOperationStatus.SUCCEEDED) {
      return { accepted: true, duplicate: true };
    }

    const attemptAt = new Date();
    await this.prisma.marketplaceOperation.update({
      where: { id: record.id, tenantId: input.tenantId },
      data: {
        status: MarketplaceOperationStatus.PROCESSING,
        attempts: { increment: 1 },
        firstAttemptAt: record.firstAttemptAt ?? attemptAt,
        lastAttemptAt: attemptAt,
        queueDelayMs: record.enqueuedAt
          ? Math.max(0, attemptAt.getTime() - record.enqueuedAt.getTime())
          : null,
        lastError: null,
      },
    });

    const provider = this.providerRegistry.get(record.provider);
    try {
      const result = record.operation === MarketplaceOperationType.CONFIRM
        ? await provider.confirmOrder?.({
            connection: record.connection,
            externalOrderId: record.externalOrderId,
            correlationId: record.correlationId,
          })
        : await provider.cancelOrder?.({
            connection: record.connection,
            externalOrderId: record.externalOrderId,
            reason: record.cancellationReason ?? '',
            correlationId: record.correlationId,
          });
      if (!result) throw new IfoodApiError('Marketplace provider operation is unavailable.', false);

      await this.prisma.marketplaceOperation.update({
        where: { id: record.id, tenantId: input.tenantId },
        data: {
          status: MarketplaceOperationStatus.ACCEPTED,
          acceptedAt: new Date(),
          httpStatus: result.httpStatus,
          providerCode: result.providerCode ?? null,
        },
      });
      this.logger.log({
        message: 'marketplace_operation_accepted',
        tenantId: record.tenantId,
        orderId: input.orderId,
        externalOrderId: record.externalOrderId,
        operation: record.operation,
        correlationId: record.correlationId,
        jobId: jobId ?? null,
        attempt: record.attempts + 1,
        durationMs: Date.now() - startedAt,
      });
      await this.divergenceService.resolveForOperation(record.tenantId, record.id, 'Provider accepted the operation.');
      return { accepted: true, duplicate: false };
    } catch (error) {
      const apiError = error instanceof IfoodApiError ? error : new IfoodApiError('Unknown iFood operation error.', false);
      await this.prisma.marketplaceOperation.update({
        where: { id: record.id, tenantId: input.tenantId },
        data: {
          status: apiError.retryable ? MarketplaceOperationStatus.FAILED : MarketplaceOperationStatus.INTERVENTION_REQUIRED,
          httpStatus: apiError.httpStatus ?? null,
          providerCode: apiError.providerCode ?? null,
          lastError: apiError.message.slice(0, 500),
        },
      });
      if (!apiError.retryable) {
        await this.divergenceService.record({
          tenantId: record.tenantId,
          marketplaceOrderId: record.marketplaceOrderId,
          internalOrderId: record.marketplaceOrder.internalOrderId,
          operationId: record.id,
          provider: record.provider,
          externalOrderId: record.externalOrderId,
          type: apiError.httpStatus === 401 || apiError.httpStatus === 403
            ? MarketplaceDivergenceType.AUTHENTICATION_FAILURE
            : MarketplaceDivergenceType.PERMANENT_PROVIDER_REJECTION,
          localState: record.marketplaceOrder.statusInternal,
          remoteState: record.marketplaceOrder.statusExternal,
          reason: apiError.message,
          recommendedAction: apiError.httpStatus === 401 || apiError.httpStatus === 403
            ? 'Reconnect the merchant credentials before retrying.'
            : 'Review the provider code and order eligibility before an administrative retry.',
          correlationId: record.correlationId,
          lastAttemptAt: attemptAt,
        });
      }
      this.logger.warn({
        message: 'marketplace_operation_failed',
        tenantId: record.tenantId,
        orderId: input.orderId,
        externalOrderId: record.externalOrderId,
        operation: record.operation,
        correlationId: record.correlationId,
        jobId: jobId ?? null,
        attempt: record.attempts + 1,
        durationMs: Date.now() - startedAt,
        retryable: apiError.retryable,
        httpStatus: apiError.httpStatus,
        providerCode: apiError.providerCode,
      });
      if (apiError.retryable) throw apiError;
      return { accepted: false, interventionRequired: true };
    }
  }

  async reconcileExternalEvent(input: {
    tenantId: string;
    externalOrderId: string;
    topic?: string | null;
  }): Promise<void> {
    const topic = input.topic?.trim().toUpperCase();
    if (!topic || !['CONFIRMED', 'ORDER_CONFIRMED', 'CANCELLED', 'ORDER_CANCELLED', 'CANCELLATION_REQUEST_FAILED'].includes(topic)) return;

    const marketplaceOrder = await this.prisma.marketplaceOrder.findFirst({
      where: { tenantId: input.tenantId, provider: MarketplaceProvider.IFOOD, externalOrderId: input.externalOrderId },
    });
    if (!marketplaceOrder) return;

    if (topic === 'CANCELLATION_REQUEST_FAILED') {
      await this.prisma.marketplaceOperation.updateMany({
        where: {
          tenantId: input.tenantId,
          marketplaceOrderId: marketplaceOrder.id,
          operation: MarketplaceOperationType.CANCEL,
          status: {
            in: [
              MarketplaceOperationStatus.PENDING,
              MarketplaceOperationStatus.QUEUED,
              MarketplaceOperationStatus.PROCESSING,
              MarketplaceOperationStatus.ACCEPTED,
            ],
          },
        },
        data: {
          status: MarketplaceOperationStatus.INTERVENTION_REQUIRED,
          completedAt: new Date(),
          providerCode: topic,
          lastError: 'iFood rejected the cancellation request.',
        },
      });
      return;
    }

    const operation = topic.includes('CANCEL') ? MarketplaceOperationType.CANCEL : MarketplaceOperationType.CONFIRM;
    await this.prisma.$transaction([
      this.prisma.marketplaceOperation.updateMany({
        where: {
          tenantId: input.tenantId,
          marketplaceOrderId: marketplaceOrder.id,
          operation,
          status: {
            in: [
              MarketplaceOperationStatus.PENDING,
              MarketplaceOperationStatus.QUEUED,
              MarketplaceOperationStatus.PROCESSING,
              MarketplaceOperationStatus.ACCEPTED,
            ],
          },
        },
        data: {
          status: MarketplaceOperationStatus.SUCCEEDED,
          completedAt: new Date(),
          providerCode: topic,
          lastError: null,
        },
      }),
      this.prisma.marketplaceOrder.updateMany({
        where: { id: marketplaceOrder.id, tenantId: input.tenantId },
        data: { statusExternal: topic, lastSyncedAt: new Date() },
      }),
    ]);
  }
}
