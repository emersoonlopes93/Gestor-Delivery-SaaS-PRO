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
    refreshTokenEnc: null,
    settingsJson: { pollingFallbackEnabled: true, presenceMode: 'POLLING' },
    tenant: { status: TenantStatus.active },
  };
  const provider = {
    pollEvents: jest.fn(),
    parsePollingEvent: jest.fn(),
    acknowledgeEvents: jest.fn(),
  };
  const prisma = {
    tenant: { findMany: jest.fn() },
    marketplaceConnection: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn() },
  };
  const inbox = { persistParsedEvent: jest.fn() };
  const featureControl = { resolveTenantFeature: jest.fn().mockResolvedValue({ enabled: true }) };

  const createService = (queue?: { add: jest.Mock }) => new MarketplacePollingService(
    prisma as never,
    new ConfigService({
      MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED: 'true',
      MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED: 'true',
      MARKETPLACE_IFOOD_POLLING_INTERVAL_MS: '30000',
    }),
    { get: jest.fn().mockReturnValue(provider) } as never,
    inbox as never,
    featureControl as never,
    queue as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    provider.pollEvents.mockReset();
    provider.parsePollingEvent.mockReset();
    provider.acknowledgeEvents.mockReset();
    inbox.persistParsedEvent.mockReset();
    prisma.marketplaceConnection.findMany.mockResolvedValue([connection]);
    prisma.marketplaceConnection.updateMany.mockResolvedValue({ count: 1 });
    featureControl.resolveTenantFeature.mockResolvedValue({ enabled: true });
    prisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-1' }]);
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
      schemaVersion: 2,
      tokenDeviceKey: 'centralized-application',
      connections: [{ tenantId: 'tenant-1', connectionId: 'conn-1' }],
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
      schemaVersion: 2,
      tokenDeviceKey: 'centralized-application',
      connections: [{ tenantId: 'tenant-1', connectionId: 'conn-1' }],
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
      schemaVersion: 2,
      tokenDeviceKey: 'centralized-application',
      connections: [{ tenantId: 'tenant-1', connectionId: 'conn-1' }],
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
      schemaVersion: 2,
      tokenDeviceKey: 'centralized-application',
      connections: [{ tenantId: 'tenant-1', connectionId: 'conn-1' }],
      scheduledAt: new Date().toISOString(),
    })).resolves.toMatchObject({ persisted: 1, acknowledged: 1 });
    expect(inbox.persistParsedEvent).toHaveBeenCalledWith(expect.objectContaining({ process: false }));
  });

  it('schedules two merchants sharing the centralized token as one token/device job', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    prisma.marketplaceConnection.findMany.mockResolvedValue([
      connection,
      { ...connection, id: 'conn-2', tenantId: 'tenant-2', externalMerchantId: 'merchant-2' },
    ]);
    prisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]);

    await expect(createService(queue).scheduleEligibleConnections()).resolves.toEqual({ inspected: 2, scheduled: 1 });
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith('ifood-poll-token-device', expect.objectContaining({
      tokenDeviceKey: 'centralized-application',
      connections: expect.arrayContaining([
        { tenantId: 'tenant-1', connectionId: 'conn-1' },
        { tenantId: 'tenant-2', connectionId: 'conn-2' },
      ]),
    }), expect.any(Object));
  });

  it('schedules connections with independent refresh tokens in distinct token/device jobs', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    prisma.marketplaceConnection.findMany.mockResolvedValue([
      { ...connection, refreshTokenEnc: 'cipher-a' },
      { ...connection, id: 'conn-2', externalMerchantId: 'merchant-2', refreshTokenEnc: 'cipher-b' },
    ]);

    await expect(createService(queue).scheduleEligibleConnections()).resolves.toEqual({ inspected: 2, scheduled: 2 });
    expect(queue.add).toHaveBeenCalledTimes(2);
  });

  it('splits more than 100 centralized merchants into provider-approved header batches', async () => {
    const connections = Array.from({ length: 101 }, (_, index) => ({
      ...connection,
      id: `conn-${index}`,
      tenantId: `tenant-${index}`,
      externalMerchantId: `merchant-${index}`,
    }));
    prisma.marketplaceConnection.findMany.mockResolvedValue(connections);
    provider.pollEvents.mockResolvedValue([]);

    await expect(createService().runConnection({
      schemaVersion: 2,
      tokenDeviceKey: 'centralized-application',
      connections: connections.map((item) => ({ tenantId: item.tenantId, connectionId: item.id })),
      scheduledAt: new Date().toISOString(),
    })).resolves.toMatchObject({ received: 0 });
    expect(provider.pollEvents).toHaveBeenCalledTimes(2);
    expect(provider.pollEvents.mock.calls[0][0].merchantIds).toHaveLength(100);
    expect(provider.pollEvents.mock.calls[1][0].merchantIds).toHaveLength(1);
  });

  it('allows only one of two concurrent workers to claim the token/device window', async () => {
    let claims = 0;
    prisma.marketplaceConnection.updateMany.mockImplementation(async (input: { data?: { pollingLastAttemptAt?: Date } }) => {
      if (input.data?.pollingLastAttemptAt) {
        claims += 1;
        return { count: claims === 1 ? 1 : 0 };
      }
      return { count: 1 };
    });
    provider.pollEvents.mockResolvedValue([]);
    const job = {
      schemaVersion: 2 as const,
      tokenDeviceKey: 'centralized-application',
      connections: [{ tenantId: 'tenant-1', connectionId: 'conn-1' }],
      scheduledAt: new Date().toISOString(),
    };

    await Promise.all([createService().runConnection(job), createService().runConnection(job)]);
    expect(provider.pollEvents).toHaveBeenCalledTimes(1);
  });

  it('does not poll when the connection is removed between scheduling and execution', async () => {
    prisma.marketplaceConnection.findMany.mockResolvedValue([]);
    await expect(createService().runConnection({
      schemaVersion: 2,
      tokenDeviceKey: 'centralized-application',
      connections: [{ tenantId: 'tenant-1', connectionId: 'removed' }],
      scheduledAt: new Date().toISOString(),
    })).resolves.toEqual({ received: 0, persisted: 0, duplicates: 0, acknowledged: 0 });
    expect(provider.pollEvents).not.toHaveBeenCalled();
  });
});
