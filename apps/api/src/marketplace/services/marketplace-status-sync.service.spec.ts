import {
  MarketplaceConnectionStatus,
  MarketplaceOperationStatus,
  MarketplaceOperationType,
  MarketplaceProvider,
} from '@prisma/client';
import { MarketplaceStatusSyncService, type MarketplaceStatusJob } from './marketplace-status-sync.service';
import { IfoodApiError } from '../providers/ifood-api.error';

describe('MarketplaceStatusSyncService', () => {
  const marketplaceOrder = {
    id: 'mp-order-1', tenantId: 'tenant-1', connectionId: 'conn-1', internalOrderId: 'order-1',
    provider: MarketplaceProvider.IFOOD, externalOrderId: 'external-1',
    connection: { id: 'conn-1', tenantId: 'tenant-1', status: MarketplaceConnectionStatus.CONNECTED },
  };
  const persistedOperation = {
    id: 'operation-1', tenantId: 'tenant-1', connectionId: 'conn-1', marketplaceOrderId: 'mp-order-1',
    provider: MarketplaceProvider.IFOOD, externalOrderId: 'external-1', operation: MarketplaceOperationType.CONFIRM,
    status: MarketplaceOperationStatus.QUEUED, idempotencyKey: 'key', payloadVersion: 1,
    cancellationReason: null, correlationId: 'corr-1', attempts: 0, lastAttemptAt: null,
    acceptedAt: null, completedAt: null, httpStatus: null, providerCode: null, lastError: null,
    createdAt: new Date(), updatedAt: new Date(), connection: marketplaceOrder.connection, marketplaceOrder,
  };

  const makeService = (withQueue = true) => {
    const prisma = {
      marketplaceOrder: { findFirst: jest.fn().mockResolvedValue(marketplaceOrder), update: jest.fn() },
      marketplaceOperation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findFirstOrThrow: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'operation-1', tenantId: 'tenant-1', connectionId: 'conn-1', marketplaceOrderId: 'mp-order-1',
          provider: MarketplaceProvider.IFOOD, externalOrderId: 'external-1', operation: MarketplaceOperationType.CONFIRM,
          status: MarketplaceOperationStatus.PENDING, idempotencyKey: 'key', payloadVersion: 1,
          cancellationReason: null, correlationId: 'corr-1', attempts: 0, lastAttemptAt: null,
          acceptedAt: null, completedAt: null, httpStatus: null, providerCode: null, lastError: null,
          createdAt: new Date(), updatedAt: new Date(),
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const provider = { confirmOrder: jest.fn().mockResolvedValue({ accepted: true, httpStatus: 202 }) };
    const registry = { get: jest.fn().mockReturnValue(provider) };
    const featureControl = { resolveTenantFeature: jest.fn().mockResolvedValue({ enabled: true }) };
    const config = { get: jest.fn().mockReturnValue('true') };
    const queue = withQueue ? { add: jest.fn().mockResolvedValue({}) } : undefined;
    return {
      prisma, provider, queue,
      service: new MarketplaceStatusSyncService(prisma as never, registry as never, featureControl as never, config as never, queue as never),
    };
  };

  it('requires BullMQ and does not silently execute synchronously', async () => {
    const { service } = makeService(false);
    await expect(service.handleInternalStatusChanged({ tenantId: 'tenant-1', orderId: 'order-1', status: 'confirmed' }))
      .rejects.toThrow('BullMQ is required');
  });

  it('persists and enqueues a deterministic tenant-safe confirmation operation', async () => {
    const { service, prisma, queue } = makeService();
    const result = await service.handleInternalStatusChanged({ tenantId: 'tenant-1', orderId: 'order-1', status: 'confirmed' });
    expect(result).toEqual({ deferred: true, operationId: 'operation-1' });
    expect(prisma.marketplaceOperation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', marketplaceOrderId: 'mp-order-1' }),
    }));
    expect(queue?.add).toHaveBeenCalledWith('order-status-sync', expect.objectContaining({
      tenantId: 'tenant-1', orderId: 'order-1', externalOrderId: 'external-1', payloadVersion: 1,
    }), expect.objectContaining({ jobId: expect.stringContaining('ifood-confirm-tenant-1') }));
  });

  it('rejects a tampered cross-tenant job before calling the provider', async () => {
    const { service, prisma, provider } = makeService();
    prisma.marketplaceOperation.findFirst.mockResolvedValueOnce(null);
    const job: MarketplaceStatusJob = {
      tenantId: 'tenant-other', orderId: 'order-1', externalOrderId: 'external-1',
      operation: MarketplaceOperationType.CONFIRM, correlationId: 'corr-1', payloadVersion: 1, operationId: 'operation-1',
    };
    await expect(service.processStatusSyncJob(job)).rejects.toThrow('Invalid or cross-tenant');
    expect(provider.confirmOrder).not.toHaveBeenCalled();
  });

  it('persists 202 as accepted but waits for an external event before succeeding', async () => {
    const { service, prisma, provider } = makeService();
    prisma.marketplaceOperation.findFirst.mockResolvedValueOnce(persistedOperation);
    const job: MarketplaceStatusJob = {
      tenantId: 'tenant-1', orderId: 'order-1', externalOrderId: 'external-1',
      operation: MarketplaceOperationType.CONFIRM, correlationId: 'corr-1', payloadVersion: 1, operationId: 'operation-1',
    };
    await expect(service.processStatusSyncJob(job)).resolves.toEqual({ accepted: true, duplicate: false });
    expect(provider.confirmOrder).toHaveBeenCalledTimes(1);
    expect(prisma.marketplaceOperation.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MarketplaceOperationStatus.ACCEPTED, httpStatus: 202 }),
    }));
  });

  it('rethrows temporary failures for BullMQ retry and persists the failure', async () => {
    const { service, prisma, provider } = makeService();
    prisma.marketplaceOperation.findFirst.mockResolvedValueOnce(persistedOperation);
    provider.confirmOrder.mockRejectedValueOnce(new IfoodApiError('rate limited', true, 429, 'RATE_LIMIT', 10000));
    const job: MarketplaceStatusJob = {
      tenantId: 'tenant-1', orderId: 'order-1', externalOrderId: 'external-1',
      operation: MarketplaceOperationType.CONFIRM, correlationId: 'corr-1', payloadVersion: 1, operationId: 'operation-1',
    };
    await expect(service.processStatusSyncJob(job)).rejects.toThrow('rate limited');
    expect(prisma.marketplaceOperation.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MarketplaceOperationStatus.FAILED, httpStatus: 429 }),
    }));
  });

  it('does not retry permanent provider rejections', async () => {
    const { service, prisma, provider } = makeService();
    prisma.marketplaceOperation.findFirst.mockResolvedValueOnce(persistedOperation);
    provider.confirmOrder.mockRejectedValueOnce(new IfoodApiError('forbidden', false, 403, 'FORBIDDEN'));
    const job: MarketplaceStatusJob = {
      tenantId: 'tenant-1', orderId: 'order-1', externalOrderId: 'external-1',
      operation: MarketplaceOperationType.CONFIRM, correlationId: 'corr-1', payloadVersion: 1, operationId: 'operation-1',
    };
    await expect(service.processStatusSyncJob(job)).resolves.toEqual({ accepted: false, interventionRequired: true });
    expect(prisma.marketplaceOperation.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MarketplaceOperationStatus.INTERVENTION_REQUIRED, httpStatus: 403 }),
    }));
  });
});
