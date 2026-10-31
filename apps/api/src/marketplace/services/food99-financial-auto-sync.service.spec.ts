import { MarketplaceConnectionStatus, MarketplaceProvider } from '@prisma/client';
import {
  FOOD99_FINANCIAL_AUTO_SYNC_CONNECTION_JOB,
  FOOD99_FINANCIAL_AUTO_SYNC_SCAN_JOB,
} from '../marketplace.constants';
import { Food99FinancialAutoSyncService } from './food99-financial-auto-sync.service';

describe('Food99FinancialAutoSyncService', () => {
  function setup(options?: { enabled?: boolean }) {
    const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    const prisma = {
      marketplaceConnection: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'connection-1' }),
      },
    };
    const reconciliation = {
      syncAutomatically: jest.fn().mockResolvedValue({
        billEntriesReceived: 0,
        billEntriesCreated: 0,
        settlementsReceived: 0,
        settlementsCreated: 0,
        settlementsUpdated: 0,
        discrepanciesDetected: 0,
      }),
    };
    const config = {
      get: jest.fn((key: string) => (
        key === 'MARKETPLACE_99FOOD_FINANCIAL_AUTO_SYNC_ENABLED'
          ? (options?.enabled === false ? 'false' : 'true')
          : undefined
      )),
    };
    const service = new Food99FinancialAutoSyncService(prisma as never, config as never, reconciliation as never, queue as never);
    return { service, queue, prisma, reconciliation };
  }

  it('registers one durable reconciliation scan instead of an in-memory interval', async () => {
    const { service, queue } = setup();
    await service.onModuleInit();
    expect(queue.add).toHaveBeenCalledWith(FOOD99_FINANCIAL_AUTO_SYNC_SCAN_JOB, { schemaVersion: 1 }, expect.objectContaining({
      jobId: FOOD99_FINANCIAL_AUTO_SYNC_SCAN_JOB,
      repeat: { every: 21_600_000 },
      attempts: 3,
    }));
  });

  it('coalesces three order activities for the same connection into one BullMQ identity', async () => {
    const { service, queue } = setup();
    await Promise.all([
      service.requestForOrderActivity({ tenantId: 'tenant-a', connectionId: 'connection-a' }),
      service.requestForOrderActivity({ tenantId: 'tenant-a', connectionId: 'connection-a' }),
      service.requestForOrderActivity({ tenantId: 'tenant-a', connectionId: 'connection-a' }),
    ]);
    const ids = queue.add.mock.calls.map((call) => call[2].jobId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(new Set([ids[0]]));
    expect(ids[0]).toMatch(/^food99-financial-order_activity-tenant-a-connection-a-\d+$/);
  });

  it('keeps tenant and connection identities isolated when scheduling activity', async () => {
    const { service, queue } = setup();
    await service.requestForOrderActivity({ tenantId: 'tenant-a', connectionId: 'connection-a' });
    await service.requestForOrderActivity({ tenantId: 'tenant-b', connectionId: 'connection-b' });
    expect(queue.add.mock.calls[0][2].jobId).not.toEqual(queue.add.mock.calls[1][2].jobId);
  });

  it('only schedules connected 99Food stores with an app shop id', async () => {
    const { service, prisma, queue } = setup();
    prisma.marketplaceConnection.findMany.mockResolvedValue([{ id: 'connection-a', tenantId: 'tenant-a' }]);
    await service.scheduleEligibleConnections(new Date('2026-10-08T12:00:00.000Z'));
    expect(prisma.marketplaceConnection.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        provider: MarketplaceProvider.FOOD_99,
        status: MarketplaceConnectionStatus.CONNECTED,
        externalStoreId: { not: null },
      }),
    }));
    expect(queue.add).toHaveBeenCalledWith(FOOD99_FINANCIAL_AUTO_SYNC_CONNECTION_JOB, expect.objectContaining({
      tenantId: 'tenant-a', connectionId: 'connection-a', trigger: 'scheduled',
    }), expect.any(Object));
  });

  it('skips an ineligible connection without calling the financial provider orchestration', async () => {
    const { service, prisma, reconciliation } = setup();
    prisma.marketplaceConnection.findFirst.mockResolvedValue(null);
    await expect(service.runConnection({
      schemaVersion: 1, tenantId: 'tenant-a', connectionId: 'connection-a', trigger: 'order_activity', scheduledAt: '2026-10-08T12:00:00.000Z',
    })).resolves.toEqual({ skipped: true, recordsReceived: 0 });
    expect(reconciliation.syncAutomatically).not.toHaveBeenCalled();
  });

  it('treats an empty provider result as a successful freshness pass and remains eligible for the next cycle', async () => {
    const { service, reconciliation } = setup();
    const job = { schemaVersion: 1 as const, tenantId: 'tenant-a', connectionId: 'connection-a', trigger: 'order_activity' as const, scheduledAt: '2026-10-08T12:00:00.000Z' };
    await expect(service.runConnection(job)).resolves.toEqual({ skipped: false, recordsReceived: 0 });
    reconciliation.syncAutomatically.mockResolvedValueOnce({
      billEntriesReceived: 2, billEntriesCreated: 2, settlementsReceived: 0, settlementsCreated: 0, settlementsUpdated: 0, discrepanciesDetected: 0,
    });
    await expect(service.runConnection(job)).resolves.toEqual({ skipped: false, recordsReceived: 2 });
    expect(reconciliation.syncAutomatically).toHaveBeenCalledTimes(2);
  });
});
