import { ConflictException } from '@nestjs/common';
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

function reconcileFood99DetailsCompletion(service: MarketplaceOrderIngestionService, input: Record<string, unknown>): Promise<void> {
  const candidate: unknown = Reflect.get(service, 'reconcileFood99DetailsCompletion');
  if (typeof candidate !== 'function') throw new Error('99Food detail-status reconciler is unavailable.');
  return (candidate as (request: Record<string, unknown>) => Promise<void>).call(service, input);
}

function applyFood99DeliveryStatus(service: MarketplaceOrderIngestionService, input: {
  tenantId: string;
  connectionId: string;
  externalOrderId: string;
  rawPayload: Record<string, unknown>;
}): Promise<void> {
  const candidate: unknown = Reflect.get(service, 'applyFood99DeliveryStatus');
  if (typeof candidate !== 'function') throw new Error('99Food delivery-status reconciler is unavailable.');
  return (candidate as (requestTenantId: string, requestConnectionId: string, requestExternalOrderId: string, payload: Record<string, unknown>) => Promise<void>)
    .call(service, input.tenantId, input.connectionId, input.externalOrderId, input.rawPayload);
}

function isCompleteFood99Snapshot(service: MarketplaceOrderIngestionService, input: {
  externalOrderId: string;
  customerName: string;
  items: unknown[];
}): boolean {
  const candidate: unknown = Reflect.get(service, 'isCompleteFood99Snapshot');
  if (typeof candidate !== 'function') throw new Error('99Food completeness validator is unavailable.');
  return (candidate as (snapshot: typeof input) => boolean).call(service, input);
}

function ordersGatewayStub() {
  return { emitOrderChanged: jest.fn() };
}

function makeFood99LifecycleService(prisma: Record<string, unknown>, ordersService = {
  updateOrderStatus: jest.fn(),
  applyOrderStatusTransitionInTransaction: jest.fn().mockResolvedValue({}),
}, options?: {
  catalogMappings?: { resolveProducts: jest.Mock };
  theoreticalStockService?: { processOrderDepletionInTransaction: jest.Mock; reverseOrderDepletionInTransaction: jest.Mock };
  orderAlertsService?: { refreshTenant: jest.Mock };
}) {
  const catalogMappings = options?.catalogMappings ?? { resolveProducts: jest.fn().mockResolvedValue(new Map()) };
  const theoreticalStockService = options?.theoreticalStockService ?? { processOrderDepletionInTransaction: jest.fn(), reverseOrderDepletionInTransaction: jest.fn() };
  const orderAlertsService = options?.orderAlertsService ?? { refreshTenant: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      ordersGatewayStub() as never,
      ordersService as never,
      {} as never,
      {} as never,
      catalogMappings as never,
      theoreticalStockService as never,
      orderAlertsService as never,
    ),
    ordersService,
    orderAlertsService,
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
  it('accepts a complete 99Food snapshot even when the provider withholds the customer name', () => {
    const { service } = makeFood99LifecycleService({});

    expect(isCompleteFood99Snapshot(service, {
      externalOrderId: '5764656197621845665',
      customerName: 'Cliente 99Food',
      items: [{ name: 'Pizza' }],
    })).toBe(true);
  });

  it('reconciles official Order Details status 600 through the canonical terminal transition', async () => {
    const tx = {
      orderTimeline: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      order: { findFirst: jest.fn().mockResolvedValue({ status: OrderStatus.out_for_delivery, fulfillmentType: 'delivery' }) },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const ordersService = { updateOrderStatus: jest.fn(), applyOrderStatusTransitionInTransaction: jest.fn().mockResolvedValue({}) };
    const { service } = makeFood99LifecycleService(prisma, ordersService);
    await reconcileFood99DetailsCompletion(service, {
      tenantId: 'tenant-1', marketplaceOrderId: 'marketplace-order-1', internalOrderId: 'order-1', externalOrderId: '5764687916991317793', externalStatus: '600', rawPayload: { complete_time: '1768815260' },
    });
    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ targetStatus: OrderStatus.completed, transitionPolicy: 'food99_authoritative' }));
    expect(tx.orderTimeline.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdAt: new Date('2026-01-19T09:34:20.000Z') }) }));
  });

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
    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      expectedCurrentStatus: OrderStatus.pending,
      targetStatus: OrderStatus.ready_for_delivery,
      transitionPolicy: 'food99_authoritative',
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
    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      targetStatus,
      transitionPolicy: 'food99_authoritative',
    }));
  });

  it('does not repeat the terminal transition or realtime side effect when the same 99Food finish event replays', async () => {
    const tx = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderTimeline: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const gateway = ordersGatewayStub();
    const ordersService = {
      updateOrderStatus: jest.fn(),
      applyOrderStatusTransitionInTransaction: jest.fn().mockResolvedValue({}),
    };
    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      gateway as never,
      ordersService as never,
      {} as never,
      {} as never,
    );

    await reconcileFood99Lifecycle(service, {
      ...food99LifecycleInput,
      topic: 'ORDERFINISH',
      currentStatus: OrderStatus.pending,
    });
    await reconcileFood99Lifecycle(service, {
      ...food99LifecycleInput,
      topic: 'ORDERFINISH',
      currentStatus: OrderStatus.completed,
    });

    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledTimes(1);
    expect(tx.orderTimeline.create).toHaveBeenCalledTimes(1);
    expect(gateway.emitOrderChanged).toHaveBeenCalledTimes(1);
  });

  it('reconciles TAKEN through the authoritative CAS primitive and refreshes the courier alert', async () => {
    const tx = {
      orderTimeline: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'marketplace-order-1', internalOrderId: 'order-1', deliveryOwnership: 'PROVIDER', normalizedPayload: {},
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findFirst: jest.fn().mockResolvedValue({ status: OrderStatus.preparing, fulfillmentType: 'delivery' }) },
      $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const ordersService = { updateOrderStatus: jest.fn(), applyOrderStatusTransitionInTransaction: jest.fn().mockResolvedValue({}) };
    const alerts = { refreshTenant: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeFood99LifecycleService(prisma, ordersService, { orderAlertsService: alerts });

    await applyFood99DeliveryStatus(service, {
      tenantId: 'tenant-1', connectionId: 'conn-1', externalOrderId: '5764607618872501234',
      rawPayload: { data: { delivery_status: 140, rider_name: 'Rider' } },
    });

    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      expectedCurrentStatus: OrderStatus.preparing,
      targetStatus: OrderStatus.out_for_delivery,
      transitionPolicy: 'food99_authoritative',
    }));
    expect(alerts.refreshTenant).toHaveBeenCalledWith('tenant-1');
  });

  it.each(['120', '130', '150', '180', '190'])('records deliveryStatus %s without forcing a commercial transition', async (deliveryStatus) => {
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'marketplace-order-1', internalOrderId: 'order-1', deliveryOwnership: 'PROVIDER', normalizedPayload: {},
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findFirst: jest.fn().mockResolvedValue({ status: OrderStatus.preparing, fulfillmentType: 'delivery' }) },
    };
    const alerts = { refreshTenant: jest.fn().mockResolvedValue(undefined) };
    const { service, ordersService } = makeFood99LifecycleService(prisma, undefined, { orderAlertsService: alerts });

    await applyFood99DeliveryStatus(service, {
      tenantId: 'tenant-1', connectionId: 'conn-1', externalOrderId: '5764607618872501234',
      rawPayload: { data: { delivery_status: deliveryStatus } },
    });

    expect(prisma.marketplaceOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ normalizedPayload: expect.objectContaining({ logistics: expect.objectContaining({ deliveryStatus }) }) }),
    }));
    expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();
    expect(ordersService.applyOrderStatusTransitionInTransaction).not.toHaveBeenCalled();
    expect(alerts.refreshTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('reconciles deliveryStatus 160 through the canonical terminal transition', async () => {
    const tx = {
      orderTimeline: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'marketplace-order-1', internalOrderId: 'order-1', deliveryOwnership: 'PROVIDER', normalizedPayload: {},
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findFirst: jest.fn().mockResolvedValue({ status: OrderStatus.out_for_delivery, fulfillmentType: 'delivery' }) },
      $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const ordersService = { updateOrderStatus: jest.fn(), applyOrderStatusTransitionInTransaction: jest.fn().mockResolvedValue({}) };
    const alerts = { refreshTenant: jest.fn().mockResolvedValue(undefined) };
    const { service } = makeFood99LifecycleService(prisma, ordersService, { orderAlertsService: alerts });

    await applyFood99DeliveryStatus(service, {
      tenantId: 'tenant-1', connectionId: 'conn-1', externalOrderId: '5764607618872501234',
      rawPayload: { data: { delivery_status: 160 } },
    });

    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      expectedCurrentStatus: OrderStatus.out_for_delivery,
      targetStatus: OrderStatus.completed,
      transitionPolicy: 'food99_authoritative',
    }));
    expect(alerts.refreshTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('preserves the commercial order when 99Food cancels only delivery', async () => {
    const divergence = { record: jest.fn().mockResolvedValue({}) };
    const prisma = {
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'marketplace-order-1', internalOrderId: 'order-1', deliveryOwnership: 'PROVIDER', normalizedPayload: {},
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findFirst: jest.fn().mockResolvedValue({ status: OrderStatus.out_for_delivery, fulfillmentType: 'delivery' }) },
    };
    const alerts = { refreshTenant: jest.fn().mockResolvedValue(undefined) };
    const { service, ordersService } = makeFood99LifecycleService(prisma, undefined, { orderAlertsService: alerts });
    Reflect.set(service, 'divergenceService', divergence);

    await applyFood99DeliveryStatus(service, {
      tenantId: 'tenant-1', connectionId: 'conn-1', externalOrderId: '5764607618872501234',
      rawPayload: { data: { delivery_status: 170 } },
    });

    expect(divergence.record).toHaveBeenCalledWith(expect.objectContaining({ remoteState: 'DELIVERY_STATUS_170' }));
    expect(ordersService.updateOrderStatus).not.toHaveBeenCalled();
    expect(alerts.refreshTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('keeps an authoritative 99Food terminal transition successful when realtime notification throws', async () => {
    const tx = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderTimeline: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const gateway = ordersGatewayStub();
    gateway.emitOrderChanged.mockImplementation(() => { throw new Error('socket unavailable'); });
    const ordersService = {
      updateOrderStatus: jest.fn(),
      applyOrderStatusTransitionInTransaction: jest.fn().mockResolvedValue({}),
    };
    const service = new MarketplaceOrderIngestionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      gateway as never,
      ordersService as never,
      {} as never,
      {} as never,
    );

    await expect(reconcileFood99Lifecycle(service, {
      ...food99LifecycleInput,
      topic: 'ORDERFINISH',
      currentStatus: OrderStatus.pending,
    })).resolves.toBeUndefined();

    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledTimes(1);
    expect(tx.orderTimeline.create).toHaveBeenCalledTimes(1);
  });

  it('does not create timeline, status sync, or realtime side effects for a stale authoritative event', async () => {
    const tx = {
      orderTimeline: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const gateway = ordersGatewayStub();
    const ordersService = {
      updateOrderStatus: jest.fn(),
      applyOrderStatusTransitionInTransaction: jest.fn().mockRejectedValue(
        new ConflictException({ code: 'ORDER_STATUS_STALE' }),
      ),
    };
    const service = new MarketplaceOrderIngestionService(
      prisma as never, {} as never, {} as never, {} as never, gateway as never,
      ordersService as never, {} as never, {} as never,
    );

    await expect(reconcileFood99Lifecycle(service, {
      ...food99LifecycleInput,
      topic: 'ORDERFINISH',
      currentStatus: OrderStatus.pending,
    })).resolves.toBeUndefined();

    expect(tx.orderTimeline.create).not.toHaveBeenCalled();
    expect(tx.marketplaceOrder.updateMany).not.toHaveBeenCalled();
    expect(gateway.emitOrderChanged).not.toHaveBeenCalled();
  });

  it('does not emit realtime when a transactional 99Food side effect fails before commit', async () => {
    const tx = {
      orderTimeline: { create: jest.fn().mockResolvedValue({}) },
      marketplaceOrder: { updateMany: jest.fn().mockRejectedValue(new Error('marketplace sync unavailable')) },
    };
    const prisma = {
      marketplaceOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn().mockImplementation((callback: (transaction: typeof tx) => Promise<void>) => callback(tx)),
    };
    const gateway = ordersGatewayStub();
    const ordersService = {
      updateOrderStatus: jest.fn(),
      applyOrderStatusTransitionInTransaction: jest.fn().mockResolvedValue({}),
    };
    const service = new MarketplaceOrderIngestionService(
      prisma as never, {} as never, {} as never, {} as never, gateway as never,
      ordersService as never, {} as never, {} as never,
    );

    await expect(reconcileFood99Lifecycle(service, {
      ...food99LifecycleInput,
      topic: 'ORDERFINISH',
      currentStatus: OrderStatus.pending,
    })).rejects.toThrow('marketplace sync unavailable');

    expect(gateway.emitOrderChanged).not.toHaveBeenCalled();
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

  it('never reconciles a historical terminal event through a rounded 64-bit order id', async () => {
    const applyLifecycle = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      marketplaceEventInbox: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'inbox-finish', tenantId: 'tenant-1', connectionId: 'conn-1',
          externalOrderId: '5764685421497879999', topic: 'orderFinish', eventId: 'event-finish',
          eventCreatedAt: new Date('2026-09-05T22:40:00.000Z'), eventSequence: null,
        }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      marketplaceOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{
          id: 'marketplace-order-1', externalOrderId: '5764685421497880000', statusInternal: OrderStatus.confirmed,
        }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const { service } = makeFood99LifecycleService(prisma);
    Reflect.set(service, 'applyLifecycleForInbox', applyLifecycle);

    await expect(service.reconcileStoredFood99TerminalOrders(10)).resolves.toBe(0);
    expect(prisma.marketplaceOrder.updateMany).not.toHaveBeenCalled();
    expect(applyLifecycle).not.toHaveBeenCalled();
  });

  it('persists lifecycle metadata before applying an event to an existing 99Food order', async () => {
    const connection = { id: 'conn-1', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99 };
    const prisma = {
      marketplaceEventInbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbox-finish', provider: MarketplaceProvider.FOOD_99, status: MarketplaceEventStatus.QUEUED,
          connection, externalOrderId: '5764685421497879999', eventId: 'event-finish',
          eventCreatedAt: new Date('2026-09-05T22:40:00.000Z'), eventSequence: null,
          topic: 'orderFinish', correlationId: 'correlation-1', rawPayload: {},
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      marketplaceOrder: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ lastExternalEventAt: null, lastExternalEventSequence: null, lastExternalEventTopic: 'orderConfirm' })
          .mockResolvedValueOnce({ id: 'marketplace-order-1', internalOrderId: 'order-1', provider: MarketplaceProvider.FOOD_99 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findFirst: jest.fn().mockResolvedValue({ status: OrderStatus.completed, fulfillmentType: 'delivery' }) },
    };
    const statusSyncService = { reconcileExternalEvent: jest.fn().mockResolvedValue(undefined) };
    const service = new MarketplaceOrderIngestionService(
      prisma as never, { get: jest.fn().mockReturnValue({}) } as never, {} as never, {} as never, ordersGatewayStub() as never, {} as never,
      statusSyncService as never, {} as never,
    );

    await expect(service.processInboxEvent('inbox-finish')).resolves.toMatchObject({ lifecycleOnly: true });
    expect(prisma.marketplaceOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastExternalEventTopic: 'orderFinish', lastExternalEventId: 'event-finish' }),
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
      ordersGatewayStub() as never,
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
      ordersGatewayStub() as never,
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
      ordersGatewayStub() as never,
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
      ordersGatewayStub() as never,
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
      ordersGatewayStub() as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.processInboxEvent('inbox-equal')).resolves.toMatchObject({ ignored: true });
    expect(provider.fetchOrderDetails).not.toHaveBeenCalled();
  });
});
