import { BadRequestException } from '@nestjs/common';
import { SmartDispatchService } from './smart-dispatch.service';

describe('SmartDispatchService', () => {
  const prisma = {
    tenantSettings: { findUnique: jest.fn() },
    deliveryDriver: { findMany: jest.fn() },
    order: { findMany: jest.fn() },
  };
  const runs = { createAssignedRun: jest.fn() };
  const service = new SmartDispatchService(prisma as never, runs as never);
  const now = new Date();

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tenantSettings.findUnique.mockResolvedValue({
      smartDispatchMode: 'ASSISTED', smartDispatchUseQueue: true,
      smartDispatchBypassDistance: true, smartDispatchAutoCarona: true,
      smartDispatchDistanceKm: 1, smartDispatchMaxStops: 3,
      smartDispatchGroupingKm: 1, lat: -23.55, lng: -46.63,
    });
    prisma.deliveryDriver.findMany.mockResolvedValue([
      { id: 'far', name: 'João', currentLat: -23.53, currentLng: -46.63, lastLocationAt: now, dispatchQueueJoinedAt: new Date(now.getTime() - 20_000) },
      { id: 'near', name: 'Carlos', currentLat: -23.549, currentLng: -46.63, lastLocationAt: now, dispatchQueueJoinedAt: new Date(now.getTime() - 10_000) },
    ]);
    prisma.order.findMany.mockResolvedValue([
      { id: 'o1', deliveryAddress: { lat: -23.56, lng: -46.64 }, marketplaceOrders: [] },
      { id: 'o2', deliveryAddress: { lat: -23.561, lng: -46.64 }, marketplaceOrders: [] },
      { id: 'o3', deliveryAddress: { lat: -23.562, lng: -46.64 }, marketplaceOrders: [] },
      { id: 'far-order', deliveryAddress: { lat: -23.7, lng: -46.8 }, marketplaceOrders: [] },
    ]);
  });

  it('temporarily bypasses the first distant driver without changing FIFO order', async () => {
    const suggestion = await service.suggestion('tenant-a');
    expect(suggestion.queue.map((driver) => driver.driverId)).toEqual(['far', 'near']);
    expect(suggestion.queue[0]).toMatchObject({ queuePosition: 1, status: 'bypassed_distance' });
    expect(suggestion.driver).toMatchObject({ driverId: 'near', queuePosition: 2 });
    expect(suggestion.orderIds).toEqual(['o1', 'o2', 'o3']);
  });

  it('uses manual fallback when GPS is stale or unavailable', async () => {
    prisma.deliveryDriver.findMany.mockResolvedValue([{ id: 'stale', name: 'João', currentLat: null, currentLng: null, lastLocationAt: null }]);
    await expect(service.suggestion('tenant-a')).resolves.toMatchObject({ driver: null, manualFallback: true });
  });

  it('uses manual fallback when the tenant disables the FIFO queue', async () => {
    prisma.tenantSettings.findUnique.mockResolvedValue({
      smartDispatchMode: 'ASSISTED', smartDispatchUseQueue: false,
    });

    await expect(service.suggestion('tenant-a')).resolves.toEqual({
      driver: null, queue: [], orderIds: [], reasons: [], manualFallback: true,
    });
    expect(prisma.deliveryDriver.findMany).not.toHaveBeenCalled();
  });

  it('suggests only the oldest order when auto-carona is disabled', async () => {
    prisma.tenantSettings.findUnique.mockResolvedValue({
      smartDispatchMode: 'ASSISTED', smartDispatchUseQueue: true,
      smartDispatchBypassDistance: true, smartDispatchAutoCarona: false,
      smartDispatchDistanceKm: 1, smartDispatchMaxStops: 3,
      smartDispatchGroupingKm: 1, lat: -23.55, lng: -46.63,
    });

    await expect(service.suggestion('tenant-a')).resolves.toMatchObject({ orderIds: ['o1'] });
  });

  it('suggests native and merchant-owned orders but fails closed for provider and unknown ownership', async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: 'native', deliveryAddress: { lat: -23.56, lng: -46.64 }, marketplaceOrders: [] },
      { id: 'merchant', deliveryAddress: { lat: -23.561, lng: -46.64 }, marketplaceOrders: [{ provider: 'IFOOD', deliveryOwnership: 'MERCHANT' }] },
      { id: 'provider', deliveryAddress: { lat: -23.562, lng: -46.64 }, marketplaceOrders: [{ provider: 'IFOOD', deliveryOwnership: 'PROVIDER' }] },
      { id: 'unknown', deliveryAddress: { lat: -23.563, lng: -46.64 }, marketplaceOrders: [{ provider: 'IFOOD', deliveryOwnership: 'UNKNOWN' }] },
    ]);

    await expect(service.suggestion('tenant-a')).resolves.toMatchObject({ orderIds: ['native', 'merchant'] });
  });

  it('revalidates the current suggestion before canonical route creation', async () => {
    runs.createAssignedRun.mockResolvedValue({ id: 'run-a' });
    await expect(service.accept('tenant-a', 'manager-a', 'near', ['o1', 'o2'])).resolves.toEqual({ id: 'run-a' });
    expect(runs.createAssignedRun).toHaveBeenCalledWith('tenant-a', 'near', ['o1', 'o2'], 'manager-a');
    prisma.deliveryDriver.findMany.mockResolvedValue([]);
    await expect(service.accept('tenant-a', 'manager-a', 'near', ['o1'])).rejects.toBeInstanceOf(BadRequestException);
  });
});
