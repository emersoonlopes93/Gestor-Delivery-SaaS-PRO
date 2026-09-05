import { MarketplaceConnectionStatus, MarketplaceEventStatus, MarketplaceProvider, OrderStatus } from '@prisma/client';
import { MarketplaceOrderIngestionService } from './marketplace-order-ingestion.service';

type Food99LifecycleInput = {
    tenantId: string;
    marketplaceOrderId: string;
    internalOrderId: string;
    externalOrderId: string;
    topic?: string;
    currentStatus: OrderStatus;
    fulfillmentType: string;
  };

function reconcileFood99Lifecycle(service: MarketplaceOrderIngestionService, input: Food99LifecycleInput): Promise<void> {
  const candidate: unknown = Reflect.get(service, 'reconcileFood99Lifecycle');
  if (typeof candidate !== 'function') throw new Error('99Food lifecycle reconciler is unavailable.');
  return (candidate as (request: Food99LifecycleInput) => Promise<void>).call(service, input);
};

function makeFood99LifecycleService(prisma: Record<string, unknown>, ordersService = { updateOrderStatus: jest.fn() }) {
  return {
    service: new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      ordersService as never,
      {} as never,
      {} as never,
    ),
    ordersService,
  };
}

const food99LifecycleInput = {
  tenantId: 'tenant-1',
  marketplaceOrderId: 'marketplace-order-1',
  internalOrderId: 'order-1',
  externalOrderId: 'external-1',
  fulfillmentType: 'delivery',
};

describe('MarketplaceOrderIngestionService', () => {
  it('advances orderConfirm through preparing exactly once for the canonical KDS entry point', async () => {
    const prisma = { marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const { service, ordersService } = makeFood99LifecycleService(prisma);

    await reconcileFood99Lifecycle(service, {
      ...food99LifecycleInput,
      topic: 'ORDERCONFIRM',
      currentStatus: OrderStatus.pending,
    });

    expect(ordersService.updateOrderStatus).toHaveBeenCalledTimes(2);
    expect(ordersService.updateOrderStatus).toHaveBeenNthCalledWith(1, 'order-1', 'tenant-1',
      expect.objectContaining({ status: OrderStatus.confirmed }), undefined, { marketplaceEvent: true });
    expect(ordersService.updateOrderStatus).toHaveBeenNthCalledWith(2, 'order-1', 'tenant-1',
      expect.objectContaining({ status: OrderStatus.preparing }), undefined, { marketplaceEvent: true });
  });

  it('reconciles orderReady from pending without creating a late KDS ticket', async () => {
    const tx = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderTimeline: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const { service, ordersService } = makeFood99LifecycleService(prisma);

    await reconcileFood99Lifecycle(service, {
      ...food99LifecycleInput,
      topic: 'ORDERREADY',
      currentStatus: OrderStatus.pending,
    });

    expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: OrderStatus.ready_for_delivery },
    }));
  });

  it.each([
    ['ORDERFINISH', OrderStatus.completed],
    ['ORDERCANCEL', OrderStatus.cancelled],
  ] as const)('reconciles %s from pending as an authoritative terminal state', async (topic, targetStatus) => {
    const tx = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderTimeline: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const { service, ordersService } = makeFood99LifecycleService(prisma);

    await reconcileFood99Lifecycle(service, {
      ...food99LifecycleInput,
      topic,
      currentStatus: OrderStatus.pending,
    });

    expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: targetStatus } }));
  });

  it('does not reopen a terminal 99Food order when an older confirmation is replayed', async () => {
    const prisma = { marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const { service, ordersService } = makeFood99LifecycleService(prisma);

    await reconcileFood99Lifecycle(service, {
      ...food99LifecycleInput,
      topic: 'ORDERCONFIRM',
      currentStatus: OrderStatus.completed,
    });

    expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();
    expect(prisma.marketplaceOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ statusInternal: OrderStatus.completed }),
    }));
  });

  it('rejects reprocess for marketplace orders from another tenant', async () => {
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.reprocessMarketplaceOrder('marketplace-order-1', 'tenant-other')).rejects.toThrow(
      'Marketplace order not found.',
    );
  });

  it('does not duplicate the internal order on reprocess when internalOrderId already exists', async () => {
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mp-order-1',
          tenantId: 'tenant-1',
          internalOrderId: 'order-1',
          provider: MarketplaceProvider.IFOOD,
          rawPayload: {},
          connection: {
            id: 'conn-1',
            tenantId: 'tenant-1',
            provider: MarketplaceProvider.IFOOD,
            status: MarketplaceConnectionStatus.CONNECTED,
            externalMerchantId: null,
            externalStoreId: null,
            displayName: null,
            authType: null,
            accessTokenEnc: null,
            refreshTokenEnc: null,
            tokenExpiresAt: null,
            scopesJson: null,
            settingsJson: null,
            lastSyncAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        }),
      },
    };

    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.reprocessMarketplaceOrder('mp-order-1', 'tenant-1')).resolves.toEqual({
      success: true,
      skipped: true,
      reason: 'already_imported',
      internalOrderId: 'order-1',
    });
  });

  it('suppresses an out-of-order event before provider or order effects', async () => {
    const connection = {
      id: 'conn-1',
      tenantId: 'tenant-1',
      provider: MarketplaceProvider.IFOOD,
      externalMerchantId: 'merchant-1',
    };
    const prisma = {
      marketplaceEventInbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbox-1',
          provider: MarketplaceProvider.IFOOD,
          status: MarketplaceEventStatus.QUEUED,
          connection,
          externalOrderId: 'external-1',
          eventId: 'event-old',
          eventCreatedAt: new Date('2026-07-16T10:00:00.000Z'),
          correlationId: 'correlation-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({ lastExternalEventAt: new Date('2026-07-16T11:00:00.000Z') }),
      },
    };
    const provider = { fetchOrderDetails: jest.fn() };
    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      { get: jest.fn().mockReturnValue(provider) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.processInboxEvent('inbox-1')).resolves.toEqual({
      processed: true,
      ignored: true,
      reason: 'out_of_order',
    });
    expect(provider.fetchOrderDetails).not.toHaveBeenCalled();
    expect(prisma.marketplaceEventInbox.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MarketplaceEventStatus.IGNORED }),
    }));
  });

  it('keeps an event retryable when the merchant mapping is unknown', async () => {
    const connectionResolver = { resolveConnection: jest.fn().mockResolvedValue(null) };
    const prisma = {
      marketplaceEventInbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbox-1',
          provider: MarketplaceProvider.FOOD_99,
          status: MarketplaceEventStatus.QUEUED,
          connection: null,
          externalMerchantId: null,
          externalStoreId: 'unknown-app-shop',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      connectionResolver as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.processInboxEvent('inbox-1')).rejects.toThrow('Marketplace connection not found for event.');
    expect(prisma.marketplaceEventInbox.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MarketplaceEventStatus.FAILED }),
    }));
    expect(connectionResolver.resolveConnection).toHaveBeenCalledWith({
      provider: MarketplaceProvider.FOOD_99,
      externalMerchantId: null,
      externalStoreId: 'unknown-app-shop',
    });
  });

  it('suppresses a lower-precedence event with the same createdAt', async () => {
    const connection = { id: 'conn-1', tenantId: 'tenant-1', provider: MarketplaceProvider.IFOOD };
    const prisma = {
      marketplaceEventInbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbox-equal',
          provider: MarketplaceProvider.IFOOD,
          status: MarketplaceEventStatus.QUEUED,
          connection,
          externalOrderId: 'external-1',
          eventId: 'event-placed',
          eventCreatedAt: new Date('2026-07-16T11:00:00.000Z'),
          eventSequence: null,
          topic: 'PLACED',
          correlationId: 'correlation-equal',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({
          lastExternalEventAt: new Date('2026-07-16T11:00:00.000Z'),
          lastExternalEventSequence: null,
          lastExternalEventTopic: 'CONFIRMED',
        }),
      },
    };
    const provider = { fetchOrderDetails: jest.fn() };
    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      { get: jest.fn().mockReturnValue(provider) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.processInboxEvent('inbox-equal')).resolves.toMatchObject({ ignored: true });
    expect(provider.fetchOrderDetails).not.toHaveBeenCalled();
  });
});
