import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryRunStatus, DeliveryStopStatus } from '@prisma/client';
import { RoutingV2Service } from './routing-v2.service';

function setup(status: DeliveryRunStatus = DeliveryRunStatus.ASSIGNED) {
  const stops = [
    { id: 'far', orderId: 'order-far', sequence: 1, status: DeliveryStopStatus.PENDING, addressSnapshot: { lat: 0, lng: 0.02 }, order: { marketplaceOrders: [] } },
    { id: 'near', orderId: 'order-near', sequence: 2, status: DeliveryStopStatus.PENDING, addressSnapshot: { lat: 0, lng: 0.01 }, order: { marketplaceOrders: [] } },
    { id: 'missing', orderId: 'order-missing', sequence: 3, status: DeliveryStopStatus.PENDING, addressSnapshot: { street: 'Sem coordenada' }, order: { marketplaceOrders: [] } },
  ];
  const tx = { deliveryStop: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, deliveryRun: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  const prisma = {
    deliveryRun: { findFirst: jest.fn().mockResolvedValue({ id: 'run-a', tenantId: 'tenant-a', status, driver: { id: 'driver-a' }, stops }) },
    tenantSettings: { findUnique: jest.fn().mockResolvedValue({ lat: 0, lng: 0 }) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
  };
  const osrm = { route: jest.fn().mockRejectedValue(new Error('timeout')) };
  return { service: new RoutingV2Service(prisma as never, osrm as never), prisma, osrm, tx };
}

describe('RoutingV2Service', () => {
  it('orders deterministically and snapshots explicit degraded ETAs without failing the run', async () => {
    const { service, tx } = setup();
    await service.calculate('tenant-a', 'run-a', 'TEST');
    const sequenceWrites = tx.deliveryStop.updateMany.mock.calls.slice(1).map((call) => call[0].data.sequence);
    expect(sequenceWrites).toEqual([1, 2, 3]);
    expect(tx.deliveryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a' }),
      data: expect.objectContaining({ routeProvider: 'haversine', routeQuality: 'DEGRADED', routeVersion: { increment: 1 } }),
    }));
  });

  it('uses road legs when all coordinates and the provider are available', async () => {
    const { service, prisma, osrm, tx } = setup();
    prisma.deliveryRun.findFirst.mockResolvedValue({ id: 'run-a', tenantId: 'tenant-a', status: DeliveryRunStatus.ASSIGNED, driver: { id: 'driver-a' }, stops: [{ id: 'a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.PENDING, addressSnapshot: { lat: 0, lng: 0.01 }, order: { marketplaceOrders: [] } }] });
    osrm.route.mockResolvedValue({ provider: 'osrm', geometry: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }], legs: [{ distanceMeters: 1200, durationSeconds: 300 }], distanceMeters: 1200, durationSeconds: 300 });
    await service.calculate('tenant-a', 'run-a', 'TEST');
    expect(tx.deliveryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ routeProvider: 'osrm', routeQuality: 'ROAD', routeDistanceMeters: 1200, routeDurationSeconds: 300 }) }));
  });

  it('does not recalculate a run that already started', async () => {
    const { service } = setup(DeliveryRunStatus.IN_PROGRESS);
    await expect(service.calculate('tenant-a', 'run-a', 'TEST')).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not rewrite stops when the run starts concurrently with route persistence', async () => {
    const { service, tx } = setup();
    tx.deliveryRun.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.calculate('tenant-a', 'run-a', 'TEST')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.deliveryStop.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a pre-existing provider-owned run before routing or persistence', async () => {
    const { service, prisma, osrm, tx } = setup();
    prisma.deliveryRun.findFirst.mockResolvedValue({
      id: 'run-a', tenantId: 'tenant-a', status: DeliveryRunStatus.ASSIGNED,
      driver: { id: 'driver-a' },
      stops: [{ id: 'a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.PENDING, addressSnapshot: { lat: 0, lng: 0.01 }, order: { marketplaceOrders: [{ provider: 'IFOOD', deliveryOwnership: 'PROVIDER' }] } }],
    });

    await expect(service.calculate('tenant-a', 'run-a', 'TEST')).rejects.toBeInstanceOf(ConflictException);
    expect(osrm.route).not.toHaveBeenCalled();
    expect(tx.deliveryStop.updateMany).not.toHaveBeenCalled();
    expect(tx.deliveryRun.updateMany).not.toHaveBeenCalled();
  });

  it('does not resolve a cross-tenant run', async () => {
    const { service, prisma } = setup(); prisma.deliveryRun.findFirst.mockResolvedValue(null);
    await expect(service.calculate('tenant-b', 'run-a', 'TEST')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.deliveryRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'run-a', tenantId: 'tenant-b' } }));
  });
});
