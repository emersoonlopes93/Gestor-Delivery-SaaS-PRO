import { MarketplaceEventChannel, MarketplaceEventStatus, MarketplaceProvider } from '@prisma/client';
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
      provider: MarketplaceProvider.IFOOD,
      headers: {},
      rawBody: Buffer.from('{}'),
      body: {},
    })).rejects.toThrow('Invalid marketplace webhook signature.');
    expect(prisma.marketplaceEventInbox.create).not.toHaveBeenCalled();
  });

  it('does not re-run effects for an already processed inbox row', async () => {
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
      reason: 'already_processed',
    });
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
      { externalMerchantId: 'merchant-webhook', settingsJson: { pollingFallbackEnabled: false } },
      { externalMerchantId: 'merchant-polling', settingsJson: { pollingFallbackEnabled: true } },
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
