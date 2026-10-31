import { BadRequestException } from '@nestjs/common';
import { Prisma, ScheduledOrderStatus, TimeSlotStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { SchedulingService } from './scheduling.service';

function createTransactionMock(occupancy: number, capacity: number) {
  const slot = {
    id: 'slot-1',
    tenantId: 'tenant-1',
    startTime: new Date('2026-07-20T21:00:00.000Z'),
    endTime: new Date('2026-07-20T21:30:00.000Z'),
    capacity,
    currentOccupancy: occupancy,
    status: TimeSlotStatus.available,
    minOrderValue: null,
    maxOrderValue: null,
    maxItems: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const scheduledOrder = {
    id: 'scheduled-1',
    tenantId: 'tenant-1',
    orderId: 'order-1',
    customerId: 'customer-1',
    timeSlotId: slot.id,
    customerName: 'Cliente',
    customerPhone: '11999999999',
    fulfillmentType: 'delivery' as const,
    scheduledFor: slot.startTime,
    estimatedDuration: 30,
    notes: null,
    status: ScheduledOrderStatus.scheduled,
    confirmedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mock = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: slot.id }]),
    timeSlot: {
      findFirst: jest.fn().mockResolvedValue(slot),
      update: jest.fn().mockResolvedValue(slot),
    },
    schedulingSettings: {
      findUnique: jest.fn().mockResolvedValue({
        enabled: true,
        acceptScheduledOrders: true,
        minimumAdvanceMinutes: 60,
        maximumAdvanceDays: 7,
        timezone: 'America/Sao_Paulo',
      }),
    },
    tenantSettings: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'customer-1',
        name: 'Cliente',
        phone: '11999999999',
      }),
    },
    schedulingWindow: {
      findMany: jest.fn().mockResolvedValue([{ startTime: '18:00', endTime: '18:30' }]),
    },
    order: {
      findFirst: jest.fn().mockResolvedValue({ id: 'order-1' }),
    },
    scheduledOrder: {
      create: jest.fn().mockResolvedValue(scheduledOrder),
    },
  };
  return { mock, slot };
}

describe('SchedulingService reservation', () => {
  let service: SchedulingService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
    service = new SchedulingService(
      Object.create(null) as PrismaService,
      Object.assign(Object.create(null) as TenantContextService, {
        getTenantId: () => 'tenant-1',
      }),
    );
  });

  afterEach(() => jest.useRealTimers());

  it('locks the slot and creates the scheduling plus occupancy update atomically', async () => {
    const { mock, slot } = createTransactionMock(0, 1);

    await service.reserveScheduledOrderInTransaction(
      Object.assign(Object.create(null) as Prisma.TransactionClient, mock),
      {
        tenantId: 'tenant-1',
        orderId: 'order-1',
        customerId: 'customer-1',
        fulfillmentType: 'delivery',
        scheduledFor: slot.startTime,
        timeSlotId: slot.id,
        estimatedDuration: 30,
      },
    );

    expect(mock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mock.scheduledOrder.create).toHaveBeenCalledTimes(1);
    expect(mock.timeSlot.update).toHaveBeenCalledWith({
      where: { id: slot.id },
      data: { currentOccupancy: 1, status: TimeSlotStatus.occupied },
    });
  });

  it('rejects the checkout when the locked slot has reached capacity', async () => {
    const { mock, slot } = createTransactionMock(1, 1);

    await expect(
      service.reserveScheduledOrderInTransaction(
        Object.assign(Object.create(null) as Prisma.TransactionClient, mock),
        {
          tenantId: 'tenant-1',
          orderId: 'order-1',
          customerId: 'customer-1',
          fulfillmentType: 'delivery',
          scheduledFor: slot.startTime,
          timeSlotId: slot.id,
          estimatedDuration: 30,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mock.scheduledOrder.create).not.toHaveBeenCalled();
    expect(mock.timeSlot.update).not.toHaveBeenCalled();
  });

  it('rejects a slot from another tenant without creating a scheduling', async () => {
    const { mock, slot } = createTransactionMock(0, 1);
    mock.timeSlot.findFirst.mockResolvedValue(null);

    await expect(
      service.reserveScheduledOrderInTransaction(
        Object.assign(Object.create(null) as Prisma.TransactionClient, mock),
        {
          tenantId: 'tenant-2',
          customerId: 'customer-1',
          fulfillmentType: 'pickup',
          scheduledFor: slot.startTime,
          timeSlotId: slot.id,
          estimatedDuration: 30,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mock.scheduledOrder.create).not.toHaveBeenCalled();
  });
});
