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
      data: { status: DriverStatus.busy },
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
      data: { status: DriverStatus.busy },
    });
  });
});
