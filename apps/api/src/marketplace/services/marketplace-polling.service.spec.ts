import { ConfigService } from '@nestjs/config';
import {
  MarketplaceConnectionStatus,
  MarketplacePollingStatus,
  MarketplaceProvider,
  TenantStatus,
} from '@prisma/client';
import { MarketplacePollingService } from './marketplace-polling.service';

describe('MarketplacePollingService', () => {
  const connection = {
    id: 'conn-1',
    tenantId: 'tenant-1',
    provider: MarketplaceProvider.IFOOD,
    status: MarketplaceConnectionStatus.CONNECTED,
    pollingStatus: MarketplacePollingStatus.DISABLED,
    externalMerchantId: 'merchant-1',
    settingsJson: { pollingFallbackEnabled: true },
    tenant: { status: TenantStatus.active },
  };
  const provider = {
    pollEvents: jest.fn(),
    parsePollingEvent: jest.fn(),
    acknowledgeEvents: jest.fn(),
  };
  const prisma = {
    marketplaceConnection: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn() },
  };
  const inbox = { persistParsedEvent: jest.fn() };
  const featureControl = { resolveTenantFeature: jest.fn().mockResolvedValue({ enabled: true }) };

  const createService = () => new MarketplacePollingService(
    prisma as never,
    new ConfigService({
      MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED: 'true',
      MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED: 'true',
      MARKETPLACE_IFOOD_POLLING_INTERVAL_MS: '30000',
    }),
    { get: jest.fn().mockReturnValue(provider) } as never,
    inbox as never,
    featureControl as never,
    undefined,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    provider.pollEvents.mockReset();
    provider.parsePollingEvent.mockReset();
    provider.acknowledgeEvents.mockReset();
    inbox.persistParsedEvent.mockReset();
    prisma.marketplaceConnection.findFirst.mockResolvedValue(connection);
    prisma.marketplaceConnection.updateMany.mockResolvedValue({ count: 1 });
    featureControl.resolveTenantFeature.mockResolvedValue({ enabled: true });
  });

  it('acknowledges only after each event is durably persisted', async () => {
    provider.pollEvents.mockResolvedValue([{ id: 'evt-1', merchantId: 'merchant-1', orderId: 'order-1', fullCode: 'PLACED' }]);
    provider.parsePollingEvent.mockResolvedValue({
      provider: MarketplaceProvider.IFOOD,
      eventId: 'evt-1',
      externalMerchantId: 'merchant-1',
      externalOrderId: 'order-1',
      topic: 'PLACED',
      rawPayload: { id: 'evt-1' },
    });
    inbox.persistParsedEvent.mockResolvedValue({ accepted: true, duplicate: false, inboxId: 'inbox-1' });
    provider.acknowledgeEvents.mockResolvedValue({ accepted: true, httpStatus: 202 });

    await expect(createService().runConnection({
      schemaVersion: 1,
      tenantId: 'tenant-1',
      connectionId: 'conn-1',
      scheduledAt: new Date().toISOString(),
    })).resolves.toMatchObject({ persisted: 1, acknowledged: 1 });
    expect(inbox.persistParsedEvent.mock.invocationCallOrder[0]).toBeLessThan(
      provider.acknowledgeEvents.mock.invocationCallOrder[0],
    );
  });

  it('does not acknowledge when durable persistence fails', async () => {
    provider.pollEvents.mockResolvedValue([{ id: 'evt-1' }]);
    provider.parsePollingEvent.mockResolvedValue({
      provider: MarketplaceProvider.IFOOD,
      eventId: 'evt-1',
      externalMerchantId: 'merchant-1',
      externalOrderId: 'order-1',
      topic: 'PLACED',
      rawPayload: { id: 'evt-1' },
    });
    inbox.persistParsedEvent.mockRejectedValue(new Error('database unavailable'));

    await expect(createService().runConnection({
      schemaVersion: 1,
      tenantId: 'tenant-1',
      connectionId: 'conn-1',
      scheduledAt: new Date().toISOString(),
    })).rejects.toThrow('database unavailable');
    expect(provider.acknowledgeEvents).not.toHaveBeenCalled();
  });

  it('blocks polling and withholds ACK on merchant integrity mismatch', async () => {
    provider.pollEvents.mockResolvedValue([{ id: 'evt-wrong' }]);
    provider.parsePollingEvent.mockResolvedValue({
      provider: MarketplaceProvider.IFOOD,
      eventId: 'evt-wrong',
      externalMerchantId: 'merchant-other',
      rawPayload: { id: 'evt-wrong' },
    });

    await expect(createService().runConnection({
      schemaVersion: 1,
      tenantId: 'tenant-1',
      connectionId: 'conn-1',
      scheduledAt: new Date().toISOString(),
    })).resolves.toMatchObject({ acknowledged: 0 });
    expect(provider.acknowledgeEvents).not.toHaveBeenCalled();
    expect(prisma.marketplaceConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pollingStatus: MarketplacePollingStatus.BLOCKED }),
    }));
  });

  it('persists, ignores and acknowledges an unknown event without stopping the cycle', async () => {
    provider.pollEvents.mockResolvedValue([{ id: 'evt-unknown' }]);
    provider.parsePollingEvent.mockResolvedValue({
      provider: MarketplaceProvider.IFOOD,
      eventId: 'evt-unknown',
      externalMerchantId: 'merchant-1',
      externalOrderId: 'order-1',
      topic: 'FUTURE_EVENT',
      rawPayload: { id: 'evt-unknown' },
    });
    inbox.persistParsedEvent.mockResolvedValue({ accepted: true, duplicate: false, inboxId: 'inbox-unknown' });
    provider.acknowledgeEvents.mockResolvedValue({ accepted: true, httpStatus: 202 });

    await expect(createService().runConnection({
      schemaVersion: 1,
      tenantId: 'tenant-1',
      connectionId: 'conn-1',
      scheduledAt: new Date().toISOString(),
    })).resolves.toMatchObject({ persisted: 1, acknowledged: 1 });
    expect(inbox.persistParsedEvent).toHaveBeenCalledWith(expect.objectContaining({ process: false }));
  });
});
