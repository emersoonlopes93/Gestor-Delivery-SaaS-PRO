import { MarketplaceConnectionStatus, MarketplacePollingStatus, MarketplaceProvider } from '@prisma/client';
import { Food99PollingService } from './food99-polling.service';

describe('Food99PollingService', () => {
  const connection = {
    id: 'connection-1', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99,
    status: MarketplaceConnectionStatus.CONNECTED, pollingStatus: MarketplacePollingStatus.DISABLED,
    externalStoreId: 'shop-1', settingsJson: { pollingFallbackEnabled: true, presenceMode: 'POLLING' },
  };
  const provider = { pollEvents: jest.fn(), parsePollingEvent: jest.fn(), acknowledgeEvents: jest.fn() };
  const prisma = { marketplaceConnection: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() } };
  const inbox = { persistParsedEvent: jest.fn() };
  const service = new Food99PollingService(
    prisma as never,
    { get: jest.fn((key: string) => ({ MARKETPLACE_99FOOD_ENABLED: 'true', MARKETPLACE_99FOOD_POLLING_ENABLED: 'true' })[key]) } as never,
    { get: jest.fn().mockReturnValue(provider) } as never,
    inbox as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.marketplaceConnection.findFirst.mockResolvedValue(connection);
    prisma.marketplaceConnection.updateMany.mockResolvedValue({ count: 1 });
  });

  it('persists each event before acknowledging the full official event tuple', async () => {
    provider.pollEvents.mockResolvedValue([{ eventId: 'event-1' }]);
    provider.parsePollingEvent.mockResolvedValue({
      provider: MarketplaceProvider.FOOD_99, eventId: 'event-1', externalOrderId: 'order-1',
      topic: 'CREATED', rawPayload: { eventId: 'event-1' },
    });
    inbox.persistParsedEvent.mockResolvedValue({ accepted: true, duplicate: false, inboxId: 'inbox-1' });
    provider.acknowledgeEvents.mockResolvedValue({ accepted: true, httpStatus: 202 });

    await expect(service.runConnection({
      schemaVersion: 1, tenantId: 'tenant-1', connectionId: 'connection-1', scheduledAt: new Date().toISOString(),
    })).resolves.toMatchObject({ received: 1, persisted: 1, acknowledged: 1 });
    expect(inbox.persistParsedEvent.mock.invocationCallOrder[0]).toBeLessThan(provider.acknowledgeEvents.mock.invocationCallOrder[0]);
    expect(provider.acknowledgeEvents).toHaveBeenCalledWith(expect.objectContaining({
      connection,
      events: [{ id: 'event-1', orderId: 'order-1', eventType: 'CREATED' }],
    }));
  });

  it('does not acknowledge when durable persistence fails', async () => {
    provider.pollEvents.mockResolvedValue([{ eventId: 'event-1' }]);
    provider.parsePollingEvent.mockResolvedValue({
      provider: MarketplaceProvider.FOOD_99, eventId: 'event-1', externalOrderId: 'order-1', topic: 'CREATED', rawPayload: {},
    });
    inbox.persistParsedEvent.mockRejectedValue(new Error('database unavailable'));
    await expect(service.runConnection({
      schemaVersion: 1, tenantId: 'tenant-1', connectionId: 'connection-1', scheduledAt: new Date().toISOString(),
    })).rejects.toThrow('database unavailable');
    expect(provider.acknowledgeEvents).not.toHaveBeenCalled();
  });
});
