import { BadRequestException } from '@nestjs/common';
import { DriversService } from './drivers.service';

describe('DriversService route-scoped location tracking', () => {
  const location = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    createMany: jest.fn(),
  };
  const driver = { findUnique: jest.fn(), update: jest.fn() };
  const prisma = {
    deliveryDriver: driver,
    driverShift: { findFirst: jest.fn() },
    deliveryRun: { findFirst: jest.fn() },
    deliveryDriverLocation: location,
    order: { findMany: jest.fn() },
    $transaction: jest.fn((operation: (client: unknown) => Promise<unknown>) => operation({
      deliveryDriverLocation: location,
      deliveryDriver: driver,
    })),
  };
  const gateway = {
    emitDriverLocationUpdated: jest.fn(),
    emitLocationUpdate: jest.fn(),
  };
  const service = new DriversService(prisma as never, gateway as never);
  const now = new Date('2026-08-12T12:00:30.000Z');
  const point = {
    eventKey: 'point-a',
    recordedAt: '2026-08-12T12:00:00.000Z',
    lat: -23.5,
    lng: -46.6,
    accuracy: 12,
    source: 'foreground' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    driver.findUnique.mockResolvedValue({
      id: 'driver-a', tenantId: 'tenant-a', lastLocationAt: null,
    });
    prisma.driverShift.findFirst.mockResolvedValue({ id: 'shift-a' });
    prisma.deliveryRun.findFirst.mockResolvedValue({ id: 'run-a' });
    location.findMany.mockResolvedValue([]);
    location.findFirst.mockResolvedValue(null);
    location.createMany.mockResolvedValue({ count: 1 });
    driver.update.mockResolvedValue({ id: 'driver-a' });
    prisma.order.findMany.mockResolvedValue([]);
  });

  it('rejects tracking when the authenticated driver has no active shift', async () => {
    prisma.driverShift.findFirst.mockResolvedValue(null);
    await expect(service.ingestDriverLocations('tenant-a', 'driver-a', [point], now))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryRun.findFirst).not.toHaveBeenCalled();
  });

  it.each(['ASSIGNED', 'COMPLETED'])('rejects tracking without an in-progress or returning run (%s)', async () => {
    prisma.deliveryRun.findFirst.mockResolvedValue(null);
    await expect(service.ingestDriverLocations('tenant-a', 'driver-a', [point], now))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a', driverId: 'driver-a', shiftId: 'shift-a',
        status: { in: ['IN_PROGRESS', 'RETURNING'] },
      }),
    }));
  });

  it('persists a tenant, shift and run-scoped sample and updates the live position', async () => {
    await expect(service.ingestDriverLocations('tenant-a', 'driver-a', [point], now))
      .resolves.toEqual({
        acknowledgedEventKeys: ['point-a'],
        persistedEventKeys: ['point-a'],
        duplicateEventKeys: [],
        sampledOutEventKeys: [],
      });
    expect(location.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: 'tenant-a', driverId: 'driver-a', shiftId: 'shift-a', runId: 'run-a',
        eventKey: 'point-a', recordedAt: new Date(point.recordedAt),
      })],
      skipDuplicates: true,
    });
    expect(gateway.emitDriverLocationUpdated).toHaveBeenCalledWith(
      'tenant-a',
      expect.objectContaining({ driverId: 'driver-a', runId: 'run-a' }),
    );
  });

  it('acknowledges an offline replay duplicate without storing it twice', async () => {
    location.findMany.mockResolvedValue([{ eventKey: 'point-a' }]);
    await expect(service.ingestDriverLocations('tenant-a', 'driver-a', [point], now))
      .resolves.toEqual({
        acknowledgedEventKeys: ['point-a'],
        persistedEventKeys: [],
        duplicateEventKeys: ['point-a'],
        sampledOutEventKeys: [],
      });
    expect(location.createMany).not.toHaveBeenCalled();
  });

  it('samples dense points while acknowledging every event key', async () => {
    const pointB = { ...point, eventKey: 'point-b', recordedAt: '2026-08-12T12:00:05.000Z' };
    const result = await service.ingestDriverLocations('tenant-a', 'driver-a', [pointB, point], now);
    expect(result.acknowledgedEventKeys).toEqual(['point-a', 'point-b']);
    expect(result.persistedEventKeys).toEqual(['point-a']);
    expect(result.sampledOutEventKeys).toEqual(['point-b']);
  });

  it('persists an ordered offline replay even when a newer live sample arrived first', async () => {
    location.findFirst.mockResolvedValue({ recordedAt: new Date('2026-08-12T12:00:20.000Z') });
    const replayA = { ...point, eventKey: 'replay-a', recordedAt: '2026-08-12T11:59:50.000Z' };
    const replayB = { ...point, eventKey: 'replay-b', recordedAt: '2026-08-12T12:00:00.000Z' };
    const result = await service.ingestDriverLocations(
      'tenant-a', 'driver-a', [replayB, replayA], now,
    );
    expect(result.persistedEventKeys).toEqual(['replay-a', 'replay-b']);
    expect(location.createMany.mock.calls[0][0].data.map(
      (sample: { eventKey: string }) => sample.eventKey,
    )).toEqual(['replay-a', 'replay-b']);
  });

  it('keeps public broadcasts scoped to active orders with a valid token', async () => {
    prisma.order.findMany.mockResolvedValue([
      { publicTrackingToken: 'token-a' },
      { publicTrackingToken: null },
    ]);
    await service.ingestDriverLocations('tenant-a', 'driver-a', [point], now);
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', deliveryDriverId: 'driver-a', status: 'out_for_delivery' },
      select: { publicTrackingToken: true },
    });
    expect(gateway.emitLocationUpdate).toHaveBeenCalledTimes(1);
    expect(gateway.emitLocationUpdate).toHaveBeenCalledWith('token-a', expect.any(Object));
  });
});
