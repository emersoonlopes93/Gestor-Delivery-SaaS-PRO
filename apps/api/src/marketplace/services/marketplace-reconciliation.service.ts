import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MarketplaceDivergenceType,
  MarketplaceOperationStatus,
  MarketplaceOperationType,
  MarketplaceProvider,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ORDER_STATUS_TRANSITIONS } from '@gestor/types';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../../orders/orders.service';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';
import { IfoodApiError } from '../providers/ifood-api.error';
import { MarketplaceDivergenceService } from './marketplace-divergence.service';
import { MarketplaceProviderRegistryService } from './marketplace-provider-registry.service';
import type { MarketplaceStatusJob } from './marketplace-status-sync.service';

const ACTIVE_RECONCILIATION_STATUSES = [
  MarketplaceOperationStatus.PENDING,
  MarketplaceOperationStatus.ACCEPTED,
  MarketplaceOperationStatus.FAILED,
  MarketplaceOperationStatus.INTERVENTION_REQUIRED,
];

@Injectable()
export class MarketplaceReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: MarketplaceProviderRegistryService,
    private readonly ordersService: OrdersService,
    private readonly divergences: MarketplaceDivergenceService,
    private readonly config: ConfigService,
    @Optional() @InjectQueue(MARKETPLACE_EVENT_QUEUE) private readonly queue?: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.queue || this.config.get<string>('MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED') !== 'true') return;
    await this.queue.add(
      'operation-reconciliation-scan',
      { schemaVersion: 1 },
      {
        jobId: 'ifood-operation-reconciliation',
        repeat: { every: 60_000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }

  async reconcileBatch(limit = 100): Promise<{ inspected: number; resolved: number; alerted: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), 250);
    const connections = await this.prisma.marketplaceConnection.findMany({
      where: { provider: MarketplaceProvider.IFOOD },
      select: { tenantId: true },
      distinct: ['tenantId'],
      take: 1000,
    });
    let inspected = 0;
    let resolved = 0;
    let alerted = 0;
    for (const { tenantId } of connections) {
      if (inspected >= safeLimit) break;
      const operations = await this.prisma.marketplaceOperation.findMany({
        where: {
          tenantId,
          provider: MarketplaceProvider.IFOOD,
          status: { in: ACTIVE_RECONCILIATION_STATUSES },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: safeLimit - inspected,
        select: { id: true },
      });
      for (const operation of operations) {
        const outcome = await this.reconcileOperation(tenantId, operation.id, randomUUID());
        inspected += 1;
        if (outcome.resolved) resolved += 1;
        if (outcome.alerted) alerted += 1;
      }
    }
    this.logger.log({
      message: 'marketplace_reconciliation_batch_completed',
      inspected,
      resolved,
      alerted,
      correlationId: randomUUID(),
    });
    return { inspected, resolved, alerted };
  }

  async reconcileOperation(
    tenantId: string,
    operationId: string,
    correlationId: string,
  ): Promise<{ resolved: boolean; alerted: boolean; remoteState?: string | null }> {
    const operation = await this.prisma.marketplaceOperation.findFirst({
      where: { id: operationId, tenantId },
      include: {
        connection: true,
        marketplaceOrder: {
          include: { internalOrder: true },
        },
      },
    });
    if (!operation) throw new BadRequestException('Marketplace operation not found.');
    if (operation.status === MarketplaceOperationStatus.SUCCEEDED) {
      return { resolved: true, alerted: false, remoteState: operation.marketplaceOrder.statusExternal };
    }
    const claimedAt = new Date();
    const claim = await this.prisma.marketplaceOperation.updateMany({
      where: { id: operation.id, tenantId, updatedAt: operation.updatedAt },
      data: { lastAttemptAt: claimedAt },
    });
    if (claim.count === 0) return { resolved: false, alerted: false };

    const provider = this.providers.get(operation.provider);
    if (!provider.fetchCurrentOrder) {
      await this.recordUnknownState(operation, correlationId, 'Provider does not expose current order lookup.');
      return { resolved: false, alerted: true };
    }

    let remoteOrder: Record<string, unknown>;
    try {
      remoteOrder = await provider.fetchCurrentOrder({
        connection: operation.connection,
        externalOrderId: operation.externalOrderId,
        correlationId,
      });
    } catch (error) {
      const apiError = error instanceof IfoodApiError ? error : null;
      await this.divergences.record({
        tenantId,
        marketplaceOrderId: operation.marketplaceOrderId,
        internalOrderId: operation.marketplaceOrder.internalOrderId,
        operationId: operation.id,
        provider: operation.provider,
        externalOrderId: operation.externalOrderId,
        type: apiError?.httpStatus === 401 || apiError?.httpStatus === 403
          ? MarketplaceDivergenceType.AUTHENTICATION_FAILURE
          : MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE,
        localState: operation.marketplaceOrder.internalOrder?.status ?? operation.marketplaceOrder.statusInternal,
        remoteState: null,
        reason: apiError?.message ?? 'Provider unavailable during reconciliation.',
        recommendedAction: apiError?.httpStatus === 401 || apiError?.httpStatus === 403
          ? 'Reconnect the merchant credentials before retrying.'
          : 'Wait for provider recovery and run reconciliation again.',
        correlationId,
        lastAttemptAt: new Date(),
      });
      return { resolved: false, alerted: true };
    }

    const remoteState = this.readRemoteState(remoteOrder);
    if (!remoteState) {
      await this.recordUnknownState(operation, correlationId, 'Provider order has no recognized status.');
      return { resolved: false, alerted: true, remoteState: null };
    }
    await this.prisma.marketplaceOrder.updateMany({
      where: { id: operation.marketplaceOrderId, tenantId },
      data: {
        statusExternal: remoteState,
        rawPayload: remoteOrder as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      },
    });

    const targetStatus = this.targetStatus(operation.operation, remoteState);
    if (targetStatus) {
      const localOrder = operation.marketplaceOrder.internalOrder;
      if (localOrder && localOrder.status !== targetStatus) {
        if (!ORDER_STATUS_TRANSITIONS[localOrder.status]?.includes(targetStatus)) {
          await this.divergences.record({
            tenantId,
            marketplaceOrderId: operation.marketplaceOrderId,
            internalOrderId: localOrder.id,
            operationId: operation.id,
            provider: operation.provider,
            externalOrderId: operation.externalOrderId,
            type: MarketplaceDivergenceType.INVALID_TRANSITION,
            localState: localOrder.status,
            remoteState,
            reason: `Reconciliation cannot apply ${localOrder.status} -> ${targetStatus}.`,
            recommendedAction: 'Inspect order history and resolve without bypassing the state machine.',
            correlationId,
            lastAttemptAt: new Date(),
          });
          return { resolved: false, alerted: true, remoteState };
        }
        await this.ordersService.updateOrderStatus(
          localOrder.id,
          tenantId,
          { status: targetStatus, note: `Status reconciliado com iFood (${remoteState}).` },
          undefined,
          { marketplaceEvent: true },
        );
      }
      await this.prisma.$transaction([
        this.prisma.marketplaceOperation.updateMany({
          where: { id: operation.id, tenantId },
          data: {
            status: MarketplaceOperationStatus.SUCCEEDED,
            completedAt: new Date(),
            providerCode: `RECONCILED_${remoteState}`.slice(0, 120),
            lastError: null,
          },
        }),
        this.prisma.marketplaceOrder.updateMany({
          where: { id: operation.marketplaceOrderId, tenantId },
          data: { statusInternal: targetStatus, statusExternal: remoteState, lastSyncedAt: new Date() },
        }),
      ]);
      await this.divergences.resolveForOperation(tenantId, operation.id, `Reconciled with remote state ${remoteState}.`);
      return { resolved: true, alerted: false, remoteState };
    }

    const now = new Date();
    const deadlineExpired = operation.deadlineAt ? operation.deadlineAt.getTime() <= now.getTime() : false;
    const acceptedTooLong = operation.status === MarketplaceOperationStatus.ACCEPTED
      && now.getTime() - (operation.acceptedAt ?? operation.updatedAt).getTime() >= 5 * 60 * 1000;
    if (deadlineExpired || acceptedTooLong) {
      const type = deadlineExpired
        ? MarketplaceDivergenceType.OPERATION_TIMEOUT
        : MarketplaceDivergenceType.EVENT_MISSING;
      await this.divergences.record({
        tenantId,
        marketplaceOrderId: operation.marketplaceOrderId,
        internalOrderId: operation.marketplaceOrder.internalOrderId,
        operationId: operation.id,
        provider: operation.provider,
        externalOrderId: operation.externalOrderId,
        type,
        localState: operation.marketplaceOrder.internalOrder?.status ?? operation.marketplaceOrder.statusInternal,
        remoteState,
        reason: deadlineExpired
          ? 'Confirmation deadline elapsed without a conclusive remote state.'
          : 'Provider accepted the operation but no conclusive event arrived.',
        recommendedAction: 'Reconcile again; do not replay an operation that may already have been accepted.',
        correlationId,
        lastAttemptAt: now,
      });
      await this.prisma.marketplaceOperation.updateMany({
        where: { id: operation.id, tenantId },
        data: { status: MarketplaceOperationStatus.INTERVENTION_REQUIRED },
      });
      return { resolved: false, alerted: true, remoteState };
    }
    return { resolved: false, alerted: false, remoteState };
  }

  async retryOperation(input: {
    tenantId: string;
    operationId: string;
    adminId: string;
    ip?: string;
  }) {
    if (!this.queue) throw new ServiceUnavailableException('BullMQ is required for marketplace retry.');
    await this.reconcileOperation(input.tenantId, input.operationId, randomUUID());
    const original = await this.prisma.marketplaceOperation.findFirst({
      where: { id: input.operationId, tenantId: input.tenantId },
      include: { marketplaceOrder: true },
    });
    if (!original) throw new BadRequestException('Marketplace operation not found.');
    if (original.status === MarketplaceOperationStatus.SUCCEEDED) {
      throw new BadRequestException('Completed marketplace operations cannot be retried.');
    }
    if (original.status === MarketplaceOperationStatus.ACCEPTED) {
      throw new BadRequestException('Accepted operations must be reconciled and cannot be replayed.');
    }
    if (
      original.status !== MarketplaceOperationStatus.FAILED
      && original.status !== MarketplaceOperationStatus.INTERVENTION_REQUIRED
    ) {
      throw new BadRequestException('Marketplace operation is not eligible for administrative retry.');
    }
    const retryCount = await this.prisma.marketplaceOperation.count({
      where: { tenantId: input.tenantId, parentOperationId: original.id },
    });
    if (retryCount >= 3) throw new BadRequestException('Administrative retry limit reached.');

    const correlationId = randomUUID();
    const retryNumber = retryCount + 1;
    const child = await this.prisma.marketplaceOperation.create({
      data: {
        tenantId: input.tenantId,
        connectionId: original.connectionId,
        marketplaceOrderId: original.marketplaceOrderId,
        provider: original.provider,
        externalOrderId: original.externalOrderId,
        operation: original.operation,
        status: MarketplaceOperationStatus.PENDING,
        idempotencyKey: `${original.idempotencyKey}:admin:${retryNumber}:${correlationId}`,
        payloadVersion: original.payloadVersion,
        cancellationReason: original.cancellationReason,
        correlationId,
        deadlineAt: original.deadlineAt,
        parentOperationId: original.id,
        requestedByAdminId: input.adminId,
        adminRetryNumber: retryNumber,
      },
    });
    const orderId = original.marketplaceOrder.internalOrderId;
    if (!orderId) throw new BadRequestException('Marketplace operation has no internal order.');
    const job: MarketplaceStatusJob = {
      tenantId: input.tenantId,
      orderId,
      externalOrderId: child.externalOrderId,
      operation: child.operation,
      correlationId,
      payloadVersion: 1,
      operationId: child.id,
    };
    const enqueuedAt = new Date();
    await this.queue.add('order-status-sync', job, {
      jobId: `ifood-admin-retry-${child.id}`,
      attempts: 3,
      backoff: { type: 'ifood-retry-after', delay: 5000 },
    });
    await this.prisma.$transaction([
      this.prisma.marketplaceOperation.updateMany({
        where: { id: child.id, tenantId: input.tenantId },
        data: { status: MarketplaceOperationStatus.QUEUED, enqueuedAt },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.adminId,
          userType: 'saas_admin',
          action: 'marketplace.operation.retry',
          resource: child.id,
          ip: input.ip ?? null,
          details: {
            originalOperationId: original.id,
            retryOperationId: child.id,
            retryNumber,
            correlationId,
          },
        },
      }),
    ]);
    return { operationId: child.id, originalOperationId: original.id, correlationId, retryNumber };
  }

  private targetStatus(operation: MarketplaceOperationType, remoteState: string): OrderStatus | null {
    const normalized = remoteState.toUpperCase();
    if (operation === MarketplaceOperationType.CANCEL && normalized.includes('CANCEL')) return OrderStatus.cancelled;
    if (
      operation === MarketplaceOperationType.CONFIRM
      && ['CONFIRMED', 'PREPARING', 'READY_TO_PICKUP', 'READY_FOR_DELIVERY', 'DISPATCHED', 'COMPLETED', 'CONCLUDED']
        .some((status) => normalized.includes(status))
    ) return OrderStatus.confirmed;
    return null;
  }

  private readRemoteState(value: Record<string, unknown>): string | null {
    for (const key of ['status', 'orderStatus', 'state']) {
      const candidate = value[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().toUpperCase();
    }
    return null;
  }

  private async recordUnknownState(
    operation: {
      id: string;
      tenantId: string;
      marketplaceOrderId: string;
      provider: MarketplaceProvider;
      externalOrderId: string;
      lastAttemptAt: Date | null;
      marketplaceOrder: { internalOrderId: string | null; statusInternal: string | null; statusExternal: string | null };
    },
    correlationId: string,
    reason: string,
  ): Promise<void> {
    await this.divergences.record({
      tenantId: operation.tenantId,
      marketplaceOrderId: operation.marketplaceOrderId,
      internalOrderId: operation.marketplaceOrder.internalOrderId,
      operationId: operation.id,
      provider: operation.provider,
      externalOrderId: operation.externalOrderId,
      type: MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE,
      localState: operation.marketplaceOrder.statusInternal,
      remoteState: operation.marketplaceOrder.statusExternal,
      reason,
      recommendedAction: 'Inspect the sanitized provider response and retry reconciliation after validation.',
      correlationId,
      lastAttemptAt: operation.lastAttemptAt,
    });
  }
}
