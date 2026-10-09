import { BadRequestException } from '@nestjs/common';
import { DriverStatus } from '@gestor/types';
import { DriversService } from './drivers.service';

describe('DriversService operational availability', () => {
  const prisma = {
    deliveryDriver: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    deliveryRun: { count: jest.fn() },
    order: { count: jest.fn() },
    driverShift: { findFirst: jest.fn() },
  };
  const service = new DriversService(prisma as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.deliveryDriver.findUnique.mockResolvedValue({
      id: 'driver-a', tenantId: 'tenant-a', status: DriverStatus.offline,
    });
    prisma.deliveryDriver.update.mockImplementation(({ data }) => Promise.resolve({
      id: 'driver-a', status: data.status,
    }));
    prisma.deliveryRun.count.mockResolvedValue(0);
    prisma.driverShift.findFirst.mockResolvedValue({ id: 'shift-a' });
  });

  it('allows an idle authenticated driver to become available', async () => {
    prisma.order.count.mockResolvedValue(0);
    await expect(service.updateOperationalStatus(
      'tenant-a', 'driver-a', DriverStatus.available,
    )).resolves.toEqual({ id: 'driver-a', status: DriverStatus.available });
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        deliveryDriverId: 'driver-a',
        status: { in: ['ready_for_delivery', 'out_for_delivery'] },
      },
    });
    expect(prisma.deliveryRun.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        driverId: 'driver-a',
        status: { in: ['PENDING_ACCEPTANCE', 'ASSIGNED', 'IN_PROGRESS', 'RETURNING'] },
      },
    });
  });

  it('keeps a driver busy while an active delivery exists', async () => {
    prisma.order.count.mockResolvedValue(1);
    await expect(service.updateOperationalStatus(
      'tenant-a', 'driver-a', DriverStatus.available,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryDriver.update).toHaveBeenCalledWith({
      where: { id: 'driver-a' },
      data: { status: DriverStatus.busy, dispatchQueueJoinedAt: null },
    });
  });

  it('keeps a driver busy while a canonical delivery run or return is active', async () => {
    prisma.deliveryRun.count.mockResolvedValue(1);
    prisma.order.count.mockResolvedValue(0);

    await expect(service.updateOperationalStatus(
      'tenant-a', 'driver-a', DriverStatus.offline,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryDriver.update).toHaveBeenCalledWith({
      where: { id: 'driver-a' },
      data: { status: DriverStatus.busy, dispatchQueueJoinedAt: null },
    });
  });

  it('does not turn availability into a financial shift start', async () => {
    prisma.order.count.mockResolvedValue(0);
    prisma.driverShift.findFirst.mockResolvedValue(null);
    await expect(service.updateOperationalStatus(
      'tenant-a', 'driver-a', DriverStatus.available,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryDriver.update).not.toHaveBeenCalled();
  });

  it('allows repeated online/offline changes without creating another financial shift', async () => {
    prisma.order.count.mockResolvedValue(0);
    const statuses = Array.from({ length: 10 }, (_, index) => (
      index % 2 === 0 ? DriverStatus.available : DriverStatus.offline
    ));

    await Promise.all(statuses.map((status) => service.updateOperationalStatus('tenant-a', 'driver-a', status)));

    expect(prisma.driverShift.findFirst).toHaveBeenCalledTimes(5);
    expect(prisma.deliveryDriver.update).toHaveBeenCalledTimes(10);
  });

  it('persists FIFO entry, preserves it while online, and clears it offline', async () => {
    prisma.order.count.mockResolvedValue(0);
    const joinedAt = new Date('2026-08-14T18:00:00.000Z');
    prisma.deliveryDriver.findUnique.mockResolvedValue({
      id: 'driver-a', tenantId: 'tenant-a', status: DriverStatus.available, dispatchQueueJoinedAt: joinedAt,
    });
    await service.updateOperationalStatus('tenant-a', 'driver-a', DriverStatus.available);
    expect(prisma.deliveryDriver.update).toHaveBeenLastCalledWith({
      where: { id: 'driver-a' }, data: { status: DriverStatus.available, dispatchQueueJoinedAt: joinedAt }, select: { id: true, status: true },
    });
    await service.updateOperationalStatus('tenant-a', 'driver-a', DriverStatus.offline);
    expect(prisma.deliveryDriver.update).toHaveBeenLastCalledWith({
      where: { id: 'driver-a' }, data: { status: DriverStatus.offline, dispatchQueueJoinedAt: null }, select: { id: true, status: true },
    });
  });
});
