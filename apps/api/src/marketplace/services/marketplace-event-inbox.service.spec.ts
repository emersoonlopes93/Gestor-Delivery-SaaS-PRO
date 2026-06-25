import { MarketplaceEventStatus, MarketplaceProvider } from '@prisma/client';
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
});
