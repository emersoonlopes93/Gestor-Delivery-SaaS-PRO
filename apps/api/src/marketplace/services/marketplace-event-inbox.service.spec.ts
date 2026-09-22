import { MarketplaceEventChannel, MarketplaceEventStatus, MarketplaceProvider, Prisma } from '@prisma/client';
import { MarketplaceEventInboxService } from './marketplace-event-inbox.service';

describe('MarketplaceEventInboxService', () => {
  const provider = {
    validateWebhook: jest.fn().mockResolvedValue(true),
    parseWebhookEvent: jest.fn().mockResolvedValue({
      provider: MarketplaceProvider.IFOOD,
      eventId: 'evt-1',
      topic: 'ORDER_PLACED',
      externalMerchantId: 'merchant-1',
      externalStoreId: 'store-1',
      externalOrderId: 'order-1',
      rawPayload: { id: 'evt-1', order: { id: 'order-1' } },
    }),
  };

  const registry = {
    get: jest.fn().mockReturnValue(provider),
  };

  const connectionService = {
    resolveConnection: jest.fn().mockResolvedValue({
      id: 'conn-1',
      tenantId: 'tenant-1',
    }),
  };

  const prisma = {
    marketplaceConnection: {
      findMany: jest.fn(),
    },
    marketplaceEventInbox: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const ingestionService = {
    processInboxEvent: jest.fn().mockResolvedValue(undefined),
    reapplyProcessedLifecycleEvent: jest.fn().mockResolvedValue({ reapplied: false, reason: 'not_replayable_lifecycle_event' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    provider.validateWebhook.mockResolvedValue(true);
  });

  it('stores and immediately processes an inbox event when no queue is available', async () => {
    prisma.marketplaceEventInbox.findFirst.mockResolvedValueOnce(null);
    prisma.marketplaceEventInbox.create.mockResolvedValueOnce({ id: 'inbox-1' });

    const service = new MarketplaceEventInboxService(
      prisma as never,
      registry as never,
      connectionService as never,
      ingestionService as never,
      undefined,
    );

    const result = await service.receiveWebhook({
      provider: MarketplaceProvider.IFOOD,
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ id: 'evt-1' })),
      body: { id: 'evt-1' },
    });

    expect(result).toEqual({ accepted: true, duplicate: false, inboxId: 'inbox-1' });
    expect(prisma.marketplaceEventInbox.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        provider: MarketplaceProvider.IFOOD,
        status: MarketplaceEventStatus.RECEIVED,
      }),
    }));
    expect(ingestionService.processInboxEvent).toHaveBeenCalledWith('inbox-1');
    expect(provider.parseWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      rawBody: expect.any(Buffer),
    }));
  });

  it('resolves a 99Food callback by its official app shop identifier', async () => {
    provider.parseWebhookEvent.mockResolvedValueOnce({
      provider: MarketplaceProvider.FOOD_99,
      eventId: 'food99:event-1',
      topic: 'orderNew',
      externalMerchantId: 'merchant-99',
      externalStoreId: 'kigula_delivery_01',
      externalOrderId: 'order-99',
      rawPayload: { app_shop_id: 'kigula_delivery_01', data: { order_id: 'order-99' } },
    });
    prisma.marketplaceEventInbox.findFirst.mockResolvedValueOnce({ id: 'inbox-99' });
    const service = new MarketplaceEventInboxService(
      prisma as never,
      registry as never,
      connectionService as never,
      ingestionService as never,
      undefined,
    );

    await expect(service.receiveWebhook({
      provider: MarketplaceProvider.FOOD_99,
      headers: {},
      rawBody: Buffer.from('{}'),
      body: {},
    })).resolves.toEqual({ accepted: true, duplicate: true, inboxId: 'inbox-99' });
    expect(connectionService.resolveConnection).toHaveBeenCalledWith({
      provider: MarketplaceProvider.FOOD_99,
      externalMerchantId: 'merchant-99',
      externalStoreId: 'kigula_delivery_01',
    });
  });

  it('does not duplicate an already persisted webhook event', async () => {
    prisma.marketplaceEventInbox.findFirst.mockResolvedValueOnce({ id: 'inbox-1' });

    const service = new MarketplaceEventInboxService(
      prisma as never,
      registry as never,
      connectionService as never,
      ingestionService as never,
      undefined,
    );

    const result = await service.receiveWebhook({
      provider: MarketplaceProvider.IFOOD,
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ id: 'evt-1' })),
      body: { id: 'evt-1' },
    });

    expect(result).toEqual({ accepted: true, duplicate: true, inboxId: 'inbox-1' });
    expect(prisma.marketplaceEventInbox.create).not.toHaveBeenCalled();
    expect(ingestionService.processInboxEvent).not.toHaveBeenCalled();
    expect(prisma.marketplaceEventInbox.update).toHaveBeenCalledWith({
      where: { id: 'inbox-1' },
      data: expect.objectContaining({
        deliveryCount: { increment: 1 },
        lastDeliveryChannel: MarketplaceEventChannel.WEBHOOK,
      }),
    });
  });

  it('scopes the same provider event id to different merchant connections', async () => {
    prisma.marketplaceEventInbox.findFirst.mockResolvedValue(null);
    prisma.marketplaceEventInbox.create
      .mockResolvedValueOnce({ id: 'inbox-a' })
      .mockResolvedValueOnce({ id: 'inbox-b' });
    const service = new MarketplaceEventInboxService(
      prisma as never,
      registry as never,
      connectionService as never,
      ingestionService as never,
      undefined,
    );
    const parsed = {
      provider: MarketplaceProvider.IFOOD,
      eventId: 'shared-event',
      externalOrderId: 'shared-order',
      rawPayload: { id: 'shared-event' },
    };

    await service.persistParsedEvent({
      parsed: { ...parsed, externalMerchantId: 'merchant-a' },
      channel: MarketplaceEventChannel.WEBHOOK,
      connection: { id: 'connection-a', tenantId: 'tenant-1' } as never,
      process: false,
    });
    await service.persistParsedEvent({
      parsed: { ...parsed, externalMerchantId: 'merchant-b' },
      channel: MarketplaceEventChannel.WEBHOOK,
      connection: { id: 'connection-b', tenantId: 'tenant-1' } as never,
      process: false,
    });

    const firstDedupeKey = prisma.marketplaceEventInbox.create.mock.calls[0][0].data.dedupeKey;
    const secondDedupeKey = prisma.marketplaceEventInbox.create.mock.calls[1][0].data.dedupeKey;
    expect(firstDedupeKey).not.toBe(secondDedupeKey);
    expect(prisma.marketplaceEventInbox.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ connectionId: 'connection-a' }),
    }));
    expect(prisma.marketplaceEventInbox.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ connectionId: 'connection-b' }),
    }));
  });

  it('keeps the dedupe identity stable when an unknown merchant is connected later', async () => {
    prisma.marketplaceEventInbox.findFirst.mockResolvedValue(null);
    prisma.marketplaceEventInbox.create
      .mockResolvedValueOnce({ id: 'inbox-before-mapping' })
      .mockResolvedValueOnce({ id: 'inbox-after-mapping' });
    const service = new MarketplaceEventInboxService(
      prisma as never,
      registry as never,
      connectionService as never,
      ingestionService as never,
      undefined,
    );
    const parsed = {
      provider: MarketplaceProvider.IFOOD,
      eventId: 'stable-event',
      externalMerchantId: 'merchant-later-mapped',
      rawPayload: { id: 'stable-event' },
    };

    await service.persistParsedEvent({ parsed, channel: MarketplaceEventChannel.WEBHOOK, connection: null, process: false });
    await service.persistParsedEvent({
      parsed,
      channel: MarketplaceEventChannel.WEBHOOK,
      connection: { id: 'connection-later', tenantId: 'tenant-1' } as never,
      process: false,
    });

    expect(prisma.marketplaceEventInbox.create.mock.calls[0][0].data.dedupeKey)
      .toBe(prisma.marketplaceEventInbox.create.mock.calls[1][0].data.dedupeKey);
  });

  it('rejects reprocess when the event does not belong to the tenant', async () => {
    prisma.marketplaceEventInbox.findFirst.mockResolvedValueOnce(null);

    const service = new MarketplaceEventInboxService(
      prisma as never,
      registry as never,
      connectionService as never,
      ingestionService as never,
      undefined,
    );

    await expect(service.reprocessEventInbox('inbox-1', 'tenant-other')).rejects.toThrow(
      'Marketplace event inbox not found.',
    );
  });

  it('rejects an invalid signature before persisting the event', async () => {
    provider.validateWebhook.mockResolvedValueOnce(false);
    const service = new MarketplaceEventInboxService(
      prisma as never,
      registry as never,
      connectionService as never,
      ingestionService as never,
      undefined,
    );
    await expect(service.receiveWebhook({
      provider: MarketplaceProvider.FOOD_99,
      headers: {},
      rawBody: Buffer.from('{}'),
      body: {},
    })).rejects.toThrow('Invalid marketplace webhook signature.');
    expect(prisma.marketplaceEventInbox.create).not.toHaveBeenCalled();
  });

  it('stores a signed 99Food shopStatus as a non-order event without dispatching ingestion', async () => {
    provider.parseWebhookEvent.mockResolvedValueOnce({
      provider: MarketplaceProvider.FOOD_99,
      eventId: null,
      topic: 'shopStatus',
      externalMerchantId: 'merchant-99',
      externalStoreId: 'store-99',
      externalOrderId: null,
      rawPayload: { type: 'shopStatus', data: { store_status: 1 } },
    });
    prisma.marketplaceEventInbox.findFirst.mockResolvedValueOnce(null);
    prisma.marketplaceEventInbox.create.mockResolvedValueOnce({ id: 'shop-status-1' });
    const service = new MarketplaceEventInboxService(
      prisma as never, registry as never, connectionService as never, ingestionService as never, undefined,
    );
    await expect(service.receiveWebhook({
      provider: MarketplaceProvider.FOOD_99, headers: {}, rawBody: Buffer.from('{}'), body: {},
    })).resolves.toEqual({ accepted: true, duplicate: false, inboxId: 'shop-status-1' });
    expect(prisma.marketplaceEventInbox.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: MarketplaceEventStatus.IGNORED, topic: 'shopStatus' }),
    }));
    expect(ingestionService.processInboxEvent).not.toHaveBeenCalled();
  });

  it('recovers a concurrent dedupe insert using the same scoped identity', async () => {
    prisma.marketplaceEventInbox.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'raced-1', status: MarketplaceEventStatus.PROCESSED });
    prisma.marketplaceEventInbox.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on provider,dedupe_key', { code: 'P2002', clientVersion: '5.0.0' },
    ));
    const service = new MarketplaceEventInboxService(
      prisma as never, registry as never, connectionService as never, ingestionService as never, undefined,
    );
    await expect(service.persistParsedEvent({
      parsed: {
        provider: MarketplaceProvider.FOOD_99, eventId: 'same-event', externalMerchantId: 'merchant-99',
        externalOrderId: '5764686451388255673', rawPayload: { type: 'orderFinish' },
      },
      channel: MarketplaceEventChannel.WEBHOOK,
      connection: { id: 'conn-1', tenantId: 'tenant-1' } as never,
    })).resolves.toEqual({ accepted: true, duplicate: true, inboxId: 'raced-1' });
    expect(prisma.marketplaceEventInbox.findFirst.mock.calls[0][0])
      .toEqual(prisma.marketplaceEventInbox.findFirst.mock.calls[1][0]);
  });

  it('only reapplies a processed inbox row when it is a known lifecycle event', async () => {
    prisma.marketplaceEventInbox.findFirst.mockResolvedValueOnce({
      id: 'inbox-1',
      status: MarketplaceEventStatus.PROCESSED,
    });
    const service = new MarketplaceEventInboxService(
      prisma as never,
      registry as never,
      connectionService as never,
      ingestionService as never,
      undefined,
    );
    await expect(service.reprocessEventInbox('inbox-1', 'tenant-1')).resolves.toEqual({
      success: true,
      skipped: true,
      reason: 'not_replayable_lifecycle_event',
    });
    expect(ingestionService.processInboxEvent).not.toHaveBeenCalled();
  });

  it('reapplies a processed 99Food lifecycle event without reimporting its order', async () => {
    prisma.marketplaceEventInbox.findFirst.mockResolvedValueOnce({
      id: 'inbox-finish', status: MarketplaceEventStatus.PROCESSED,
    });
    ingestionService.reapplyProcessedLifecycleEvent.mockResolvedValueOnce({ reapplied: true, reason: 'lifecycle_reapplied' });
    const service = new MarketplaceEventInboxService(
      prisma as never, registry as never, connectionService as never, ingestionService as never, undefined,
    );
    await expect(service.reprocessEventInbox('inbox-finish', 'tenant-1')).resolves.toEqual({
      success: true, skipped: false, reason: 'lifecycle_reapplied',
    });
    expect(ingestionService.reapplyProcessedLifecycleEvent).toHaveBeenCalledWith('inbox-finish', 'tenant-1');
    expect(ingestionService.processInboxEvent).not.toHaveBeenCalled();
  });

  it('answers per-merchant webhook presence without overlapping polling presence', async () => {
    provider.parseWebhookEvent.mockResolvedValueOnce({
      provider: MarketplaceProvider.IFOOD,
      eventId: 'heartbeat-1',
      topic: 'KEEPALIVE',
      rawPayload: { merchantIds: ['merchant-webhook', 'merchant-polling'] },
    });
    prisma.marketplaceConnection.findMany.mockResolvedValueOnce([
      { externalMerchantId: 'merchant-webhook', settingsJson: { pollingFallbackEnabled: false, presenceMode: 'WEBHOOK' } },
      { externalMerchantId: 'merchant-polling', settingsJson: { pollingFallbackEnabled: true, presenceMode: 'POLLING' } },
    ]);
    const service = new MarketplaceEventInboxService(
      prisma as never,
      registry as never,
      connectionService as never,
      ingestionService as never,
      undefined,
    );
    await expect(service.receiveWebhook({
      provider: MarketplaceProvider.IFOOD,
      headers: {},
      rawBody: Buffer.from('{}'),
      body: {},
    })).resolves.toEqual({ accepted: true, heartbeat: true, merchantIds: ['merchant-webhook'] });
    expect(prisma.marketplaceEventInbox.create).not.toHaveBeenCalled();
  });
});
