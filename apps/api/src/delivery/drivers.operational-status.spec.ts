import { BadRequestException } from '@nestjs/common';
import { DriverStatus } from '@gestor/types';
import { DriversService } from './drivers.service';

describe('DriversService operational availability', () => {
  const prisma = {
    deliveryDriver: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
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
});
