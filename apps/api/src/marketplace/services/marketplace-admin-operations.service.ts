import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MarketplaceDivergenceStatus,
  MarketplaceDivergenceType,
  MarketplaceEventStatus,
  MarketplaceOperationStatus,
  MarketplaceOperationType,
  MarketplaceProvider,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MarketplaceCredentialService } from './marketplace-credential.service';

export type MarketplaceAdminPage = {
  tenantId: string;
  page: number;
  pageSize: number;
};

@Injectable()
export class MarketplaceAdminOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MarketplaceCredentialService,
  ) {}

  async listOperations(input: MarketplaceAdminPage & {
    status?: MarketplaceOperationStatus;
    operation?: MarketplaceOperationType;
  }) {
    const where = {
      tenantId: input.tenantId,
      provider: MarketplaceProvider.IFOOD,
      ...(input.status ? { status: input.status } : {}),
      ...(input.operation ? { operation: input.operation } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.marketplaceOperation.count({ where }),
      this.prisma.marketplaceOperation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          tenantId: true,
          marketplaceOrderId: true,
          externalOrderId: true,
          operation: true,
          status: true,
          correlationId: true,
          attempts: true,
          enqueuedAt: true,
          firstAttemptAt: true,
          lastAttemptAt: true,
          acceptedAt: true,
          completedAt: true,
          deadlineAt: true,
          queueDelayMs: true,
          httpStatus: true,
          providerCode: true,
          lastError: true,
          parentOperationId: true,
          requestedByAdminId: true,
          adminRetryNumber: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async listDivergences(input: MarketplaceAdminPage & {
    status?: MarketplaceDivergenceStatus;
    type?: MarketplaceDivergenceType;
  }) {
    const where = {
      tenantId: input.tenantId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.type ? { type: input.type } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.marketplaceDivergence.count({ where }),
      this.prisma.marketplaceDivergence.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          tenantId: true,
          marketplaceOrderId: true,
          internalOrderId: true,
          operationId: true,
          externalOrderId: true,
          type: true,
          status: true,
          localState: true,
          remoteState: true,
          reason: true,
          recommendedAction: true,
          correlationId: true,
          lastAttemptAt: true,
          acknowledgedAt: true,
          acknowledgedBy: true,
          resolvedAt: true,
          resolutionNote: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async listFailures(input: MarketplaceAdminPage) {
    const where = {
      tenantId: input.tenantId,
      provider: MarketplaceProvider.IFOOD,
      status: { in: [MarketplaceOperationStatus.FAILED, MarketplaceOperationStatus.INTERVENTION_REQUIRED] },
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.marketplaceOperation.count({ where }),
      this.prisma.marketplaceOperation.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          tenantId: true,
          externalOrderId: true,
          operation: true,
          status: true,
          correlationId: true,
          attempts: true,
          httpStatus: true,
          providerCode: true,
          lastError: true,
          lastAttemptAt: true,
          updatedAt: true,
        },
      }),
    ]);
    return { items, page: input.page, pageSize: input.pageSize, total };
  }

  async getOperationHistory(tenantId: string, operationId: string) {
    const root = await this.prisma.marketplaceOperation.findFirst({
      where: { id: operationId, tenantId },
      select: { id: true, parentOperationId: true },
    });
    if (!root) throw new BadRequestException('Marketplace operation not found.');
    const rootId = root.parentOperationId ?? root.id;
    return this.prisma.marketplaceOperation.findMany({
      where: { tenantId, OR: [{ id: rootId }, { parentOperationId: rootId }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        parentOperationId: true,
        status: true,
        correlationId: true,
        attempts: true,
        requestedByAdminId: true,
        adminRetryNumber: true,
        providerCode: true,
        lastError: true,
        createdAt: true,
        enqueuedAt: true,
        firstAttemptAt: true,
        acceptedAt: true,
        completedAt: true,
      },
    });
  }

  async getOperation(tenantId: string, operationId: string) {
    const operation = await this.prisma.marketplaceOperation.findFirst({
      where: { id: operationId, tenantId },
      select: {
        id: true,
        tenantId: true,
        marketplaceOrderId: true,
        externalOrderId: true,
        operation: true,
        status: true,
        correlationId: true,
        attempts: true,
        enqueuedAt: true,
        firstAttemptAt: true,
        lastAttemptAt: true,
        acceptedAt: true,
        completedAt: true,
        deadlineAt: true,
        queueDelayMs: true,
        httpStatus: true,
        providerCode: true,
        lastError: true,
        parentOperationId: true,
        requestedByAdminId: true,
        adminRetryNumber: true,
        createdAt: true,
        updatedAt: true,
        marketplaceOrder: {
          select: {
            internalOrderId: true,
            statusExternal: true,
            statusInternal: true,
            externalCreatedAt: true,
            preparationStartAt: true,
            confirmationDeadlineAt: true,
            lastExternalEventAt: true,
            lastExternalEventId: true,
          },
        },
        divergences: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            status: true,
            reason: true,
            recommendedAction: true,
            createdAt: true,
            resolvedAt: true,
          },
        },
      },
    });
    if (!operation) throw new BadRequestException('Marketplace operation not found.');
    return operation;
  }

  async acknowledgeDivergence(input: {
    tenantId: string;
    divergenceId: string;
    adminId: string;
    note?: string;
    ip?: string;
  }) {
    const divergence = await this.prisma.marketplaceDivergence.findFirst({
      where: { id: input.divergenceId, tenantId: input.tenantId },
    });
    if (!divergence) throw new BadRequestException('Marketplace divergence not found.');
    if (divergence.status === MarketplaceDivergenceStatus.RESOLVED) {
      throw new BadRequestException('Resolved divergence cannot be acknowledged again.');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.marketplaceDivergence.updateMany({
        where: { id: divergence.id, tenantId: input.tenantId },
        data: {
          status: MarketplaceDivergenceStatus.ACKNOWLEDGED,
          acknowledgedAt: now,
          acknowledgedBy: input.adminId,
          resolutionNote: input.note?.trim().slice(0, 500) || null,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.adminId,
          userType: 'saas_admin',
          action: 'marketplace.divergence.acknowledge',
          resource: divergence.id,
          ip: input.ip ?? null,
          details: { divergenceId: divergence.id, note: input.note?.trim().slice(0, 500) || null },
        },
      }),
    ]);
    return { id: divergence.id, status: MarketplaceDivergenceStatus.ACKNOWLEDGED, acknowledgedAt: now };
  }

  async getMetrics(tenantId: string) {
    const now = new Date();
    const deadlineSoon = new Date(now.getTime() + 2 * 60 * 1000);
    const [
      pendingOperations,
      oldestOperation,
      deadlinesSoon,
      deadlinesExpired,
      duplicateEvents,
      outOfOrderEvents,
      openDivergences,
      resolvedDivergences,
      adminRetries,
      authFailures,
      rateLimits,
      provider5xx,
      completedOperations,
    ] = await this.prisma.$transaction([
      this.prisma.marketplaceOperation.count({
        where: {
          tenantId,
          status: { in: [MarketplaceOperationStatus.PENDING, MarketplaceOperationStatus.QUEUED, MarketplaceOperationStatus.PROCESSING, MarketplaceOperationStatus.ACCEPTED, MarketplaceOperationStatus.FAILED] },
        },
      }),
      this.prisma.marketplaceOperation.findFirst({
        where: {
          tenantId,
          status: { in: [MarketplaceOperationStatus.PENDING, MarketplaceOperationStatus.QUEUED, MarketplaceOperationStatus.PROCESSING, MarketplaceOperationStatus.ACCEPTED, MarketplaceOperationStatus.FAILED] },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.marketplaceOperation.count({
        where: {
          tenantId,
          operation: MarketplaceOperationType.CONFIRM,
          deadlineAt: { gt: now, lte: deadlineSoon },
          status: { notIn: [MarketplaceOperationStatus.SUCCEEDED, MarketplaceOperationStatus.INTERVENTION_REQUIRED] },
        },
      }),
      this.prisma.marketplaceOperation.count({
        where: {
          tenantId,
          operation: MarketplaceOperationType.CONFIRM,
          deadlineAt: { lte: now },
          status: { not: MarketplaceOperationStatus.SUCCEEDED },
        },
      }),
      this.prisma.marketplaceEventInbox.aggregate({
        where: { tenantId },
        _sum: { duplicateCount: true },
      }),
      this.prisma.marketplaceEventInbox.count({
        where: { tenantId, status: MarketplaceEventStatus.IGNORED, lastError: 'out_of_order_event_suppressed' },
      }),
      this.prisma.marketplaceDivergence.count({
        where: { tenantId, status: { in: [MarketplaceDivergenceStatus.OPEN, MarketplaceDivergenceStatus.ACKNOWLEDGED] } },
      }),
      this.prisma.marketplaceDivergence.count({ where: { tenantId, status: MarketplaceDivergenceStatus.RESOLVED } }),
      this.prisma.marketplaceOperation.count({ where: { tenantId, adminRetryNumber: { gt: 0 } } }),
      this.prisma.marketplaceDivergence.count({ where: { tenantId, type: MarketplaceDivergenceType.AUTHENTICATION_FAILURE } }),
      this.prisma.marketplaceOperation.count({ where: { tenantId, httpStatus: 429 } }),
      this.prisma.marketplaceOperation.count({ where: { tenantId, httpStatus: { gte: 500, lt: 600 } } }),
      this.prisma.marketplaceOperation.findMany({
        where: { tenantId, completedAt: { not: null } },
        select: { createdAt: true, completedAt: true },
        orderBy: { completedAt: 'desc' },
        take: 500,
      }),
    ]);
    const conclusiveTimes = completedOperations.flatMap((item) => item.completedAt
      ? [item.completedAt.getTime() - item.createdAt.getTime()]
      : []);
    return {
      tenantId,
      measuredAt: now,
      pendingOperations,
      oldestOperationAgeMs: oldestOperation ? now.getTime() - oldestOperation.createdAt.getTime() : 0,
      confirmationsNearDeadline: deadlinesSoon,
      deadlinesExpired,
      duplicateEvents: duplicateEvents._sum.duplicateCount ?? 0,
      outOfOrderEvents,
      openDivergences,
      resolvedDivergences,
      administrativeRetries: adminRetries,
      authenticationFailures: authFailures,
      rateLimitResponses: rateLimits,
      provider5xxResponses: provider5xx,
      averageTimeToConclusiveEventMs: conclusiveTimes.length
        ? Math.round(conclusiveTimes.reduce((sum, value) => sum + value, 0) / conclusiveTimes.length)
        : null,
    };
  }

  async rotateConnectionCredentials(input: {
    tenantId: string;
    connectionId: string;
    adminId: string;
    ip?: string;
  }) {
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: { id: input.connectionId, tenantId: input.tenantId },
      select: { id: true, accessTokenEnc: true, refreshTokenEnc: true },
    });
    if (!connection) throw new BadRequestException('Marketplace connection not found.');
    const accessTokenEnc = connection.accessTokenEnc ? this.credentials.rotate(connection.accessTokenEnc) : null;
    const refreshTokenEnc = connection.refreshTokenEnc ? this.credentials.rotate(connection.refreshTokenEnc) : null;
    await this.prisma.$transaction([
      this.prisma.marketplaceConnection.updateMany({
        where: { id: connection.id, tenantId: input.tenantId },
        data: { accessTokenEnc, refreshTokenEnc },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: input.adminId,
          userType: 'saas_admin',
          action: 'marketplace.credentials.rotate',
          resource: connection.id,
          ip: input.ip ?? null,
          details: { connectionId: connection.id, rotated: true },
        },
      }),
    ]);
    return { connectionId: connection.id, rotated: true };
  }
}
