import {
  MarketplaceConnectionStatus,
  MarketplaceDivergenceType,
  MarketplaceOperationStatus,
  MarketplaceOperationType,
  MarketplaceProvider,
  OrderStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { IfoodApiError } from '../providers/ifood-api.error';
import { MarketplaceReconciliationService } from './marketplace-reconciliation.service';

describe('MarketplaceReconciliationService', () => {
  const now = new Date('2026-07-16T15:00:00.000Z');
  const operation = {
    id: 'operation-1',
    tenantId: 'tenant-1',
    connectionId: 'connection-1',
    marketplaceOrderId: 'marketplace-order-1',
    provider: MarketplaceProvider.IFOOD,
    externalOrderId: 'external-order-1',
    operation: MarketplaceOperationType.CONFIRM,
    status: MarketplaceOperationStatus.ACCEPTED,
    correlationId: 'correlation-1',
    deadlineAt: new Date(Date.now() + 8 * 60 * 1000),
    acceptedAt: new Date(),
    lastAttemptAt: now,
    createdAt: now,
    updatedAt: now,
    connection: {
      id: 'connection-1',
      tenantId: 'tenant-1',
      provider: MarketplaceProvider.IFOOD,
      status: MarketplaceConnectionStatus.CONNECTED,
    },
    marketplaceOrder: {
      id: 'marketplace-order-1',
      internalOrderId: 'order-1',
      statusInternal: OrderStatus.pending,
      statusExternal: 'PLACED',
      internalOrder: { id: 'order-1', status: OrderStatus.pending },
    },
  };

  const makeService = () => {
    const prisma = {
      marketplaceOperation: {
        findFirst: jest.fn().mockResolvedValue(operation),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      marketplaceConnection: { findMany: jest.fn().mockResolvedValue([{ tenantId: 'tenant-1' }]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const provider = {
      fetchCurrentOrder: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }),
    };
    const providers = { get: jest.fn().mockReturnValue(provider) };
    const ordersService = { updateOrderStatus: jest.fn().mockResolvedValue({}) };
    const divergences = {
      record: jest.fn().mockResolvedValue({}),
      resolveForOperation: jest.fn().mockResolvedValue(undefined),
    };
    const ingestion = {
      reconcileStoredFood99TerminalOrders: jest.fn().mockResolvedValue(0),
      repairIncompleteFood99Orders: jest.fn().mockResolvedValue(0),
    };
    const service = new MarketplaceReconciliationService(
      prisma as never,
      providers as never,
      ordersService as never,
      divergences as never,
      ingestion as never,
      new ConfigService({ MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED: 'false' }),
      undefined,
    );
    return { service, prisma, provider, ordersService, divergences };
  };

  it('resolves an accepted confirmation from the current remote state', async () => {
    const { service, ordersService, divergences } = makeService();
    await expect(service.reconcileOperation('tenant-1', 'operation-1', 'reconcile-1')).resolves.toEqual({
      resolved: true,
      alerted: false,
      remoteState: 'CONFIRMED',
    });
    expect(ordersService.updateOrderStatus).toHaveBeenCalledWith(
      'order-1',
      'tenant-1',
      expect.objectContaining({ status: OrderStatus.confirmed }),
      undefined,
      { marketplaceEvent: true },
    );
    expect(divergences.resolveForOperation).toHaveBeenCalledWith(
      'tenant-1',
      'operation-1',
      expect.stringContaining('CONFIRMED'),
    );
  });

  it('reapplies persisted terminal 99Food events during the scheduled reconciliation batch', async () => {
    const { service } = makeService();
    const ingestion: {
      reconcileStoredFood99TerminalOrders: jest.Mock;
      repairIncompleteFood99Orders: jest.Mock;
    } = Reflect.get(service, 'ingestion') as never;

    await expect(service.reconcileBatch(10)).resolves.toEqual({ inspected: 0, resolved: 0, alerted: 0 });
    expect(ingestion.reconcileStoredFood99TerminalOrders).toHaveBeenCalledWith(10);
    expect(ingestion.repairIncompleteFood99Orders).toHaveBeenCalledWith(10);
  });

  it('keeps a non-conclusive operation pending without replaying it', async () => {
    const { service, provider, ordersService } = makeService();
    provider.fetchCurrentOrder.mockResolvedValueOnce({ status: 'PLACED' });
    await expect(service.reconcileOperation('tenant-1', 'operation-1', 'reconcile-2')).resolves.toEqual({
      resolved: false,
      alerted: false,
      remoteState: 'PLACED',
    });
    expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('records an operation timeout after the confirmation deadline', async () => {
    const { service, prisma, provider, divergences } = makeService();
    prisma.marketplaceOperation.findFirst.mockResolvedValueOnce({
      ...operation,
      deadlineAt: new Date(Date.now() - 1000),
    });
    provider.fetchCurrentOrder.mockResolvedValueOnce({ status: 'PLACED' });
    await expect(service.reconcileOperation('tenant-1', 'operation-1', 'reconcile-3')).resolves.toEqual({
      resolved: false,
      alerted: true,
      remoteState: 'PLACED',
    });
    expect(divergences.record).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      type: MarketplaceDivergenceType.OPERATION_TIMEOUT,
    }));
  });

  it('records provider unavailability without changing local order state', async () => {
    const { service, provider, ordersService, divergences } = makeService();
    provider.fetchCurrentOrder.mockRejectedValueOnce(new IfoodApiError('unavailable', true, 503));
    await expect(service.reconcileOperation('tenant-1', 'operation-1', 'reconcile-4')).resolves.toEqual({
      resolved: false,
      alerted: true,
    });
    expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();
    expect(divergences.record).toHaveBeenCalledWith(expect.objectContaining({
      type: MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE,
    }));
  });

  it('uses optimistic claiming so concurrent scans call the provider once', async () => {
    const { service, prisma, provider } = makeService();
    prisma.marketplaceOperation.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });
    const results = await Promise.all([
      service.reconcileOperation('tenant-1', 'operation-1', 'reconcile-a'),
      service.reconcileOperation('tenant-1', 'operation-1', 'reconcile-b'),
    ]);
    expect(results).toContainEqual({ resolved: false, alerted: false });
    expect(provider.fetchCurrentOrder).toHaveBeenCalledTimes(1);
  });
});
