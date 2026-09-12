import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryRunStatus, DeliveryStopStatus } from '@prisma/client';
import { DeliveryRunsService } from './delivery-runs.service';

const baseRun = (overrides: Record<string, unknown> = {}) => ({
  id: 'run-a',
  tenantId: 'tenant-a',
  driverId: 'driver-a',
  shiftId: 'shift-a',
  status: DeliveryRunStatus.PENDING_ACCEPTANCE,
  version: 1,
  history: [],
  assignedAt: null,
  acceptedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  startedAt: null,
  returningAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-08-11T12:00:00.000Z'),
  updatedAt: new Date('2026-08-11T12:00:00.000Z'),
  stops: [],
  ...overrides,
});

describe('DeliveryRunsService', () => {
  const tx = {
    deliveryDriver: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    driverShift: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    deliveryRun: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    deliveryStop: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    tenantSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    order: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    orderTimeline: { create: jest.fn(), createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    deliveryDriver: tx.deliveryDriver,
    driverShift: tx.driverShift,
    deliveryRun: tx.deliveryRun,
    deliveryDriverLocation: { findMany: jest.fn() },
    deliveryStop: tx.deliveryStop,
    tenantSettings: tx.tenantSettings,
    order: tx.order,
    $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const earnings = { shiftSnapshot: jest.fn(), postDailyRate: jest.fn(), stopSnapshot: jest.fn(), postStop: jest.fn() };
  const gateway = { emitOrderChanged: jest.fn() };
  const ordersService = { applyOrderStatusTransitionInTransaction: jest.fn() };
  const service = new DeliveryRunsService(
    prisma as never,
    earnings as never,
    ordersService as never,
    undefined,
    gateway as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    earnings.shiftSnapshot.mockResolvedValue({ dailyRateSnapshot: 0, currencySnapshot: 'BRL', paySnapshotAt: new Date() });
    earnings.stopSnapshot.mockReturnValue({ payAmountSnapshot: 7, payCurrencySnapshot: 'BRL', payAttemptSnapshot: false });
    ordersService.applyOrderStatusTransitionInTransaction.mockImplementation(async (_tx, input) => ({
      updatedOrder: { id: input.orderId, status: input.targetStatus },
    }));
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    tx.deliveryDriver.update.mockResolvedValue({ id: 'driver-a' });
    tx.deliveryRun.updateMany.mockResolvedValue({ count: 1 });
    tx.deliveryStop.updateMany.mockResolvedValue({ count: 1 });
    tx.deliveryStop.count.mockResolvedValue(0);
    tx.deliveryStop.findMany.mockResolvedValue([]);
  });

  it('requires tracking only while an active shift has an in-progress or returning route', async () => {
    tx.driverShift.findFirst.mockResolvedValue({
      id: 'shift-a', status: 'ACTIVE', startedAt: new Date('2026-08-12T10:00:00.000Z'), endedAt: null,
    });
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.IN_PROGRESS,
      driver: { name: 'Ana' },
      stops: [
        { id: 'stop-done', status: DeliveryStopStatus.DELIVERED },
        { id: 'stop-next', status: DeliveryStopStatus.CURRENT },
      ],
    }));
    tx.tenantSettings.findUnique.mockResolvedValue({ lat: -23.55, lng: -46.63 });
    await expect(service.getDriverWorkState('tenant-a', 'driver-a'))
      .resolves.toEqual(expect.objectContaining({
        trackingRequired: true,
        activeRun: expect.objectContaining({ origin: { lat: -23.55, lng: -46.63, label: 'Loja' } }),
      }));

    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.ASSIGNED,
      driver: { name: 'Ana' },
    }));
    await expect(service.getDriverWorkState('tenant-a', 'driver-a'))
      .resolves.toEqual(expect.objectContaining({ trackingRequired: false }));

    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.RETURNING,
      driver: { name: 'Ana' },
      stops: [{ id: 'stop-return', status: DeliveryStopStatus.RETURN_TO_STORE }],
    }));
    await expect(service.getDriverWorkState('tenant-a', 'driver-a'))
      .resolves.toEqual(expect.objectContaining({ trackingRequired: true }));
  });

  it('maps the canonical KDS block and run-scoped override without exposing audit fields', async () => {
    tx.driverShift.findFirst.mockResolvedValue({
      id: 'shift-a', status: 'ACTIVE', startedAt: new Date('2026-08-12T10:00:00.000Z'), endedAt: null,
    });
    tx.tenantSettings.findUnique.mockResolvedValue({ lat: null, lng: null });
    tx.deliveryStop.findMany.mockResolvedValue([
      { orderNumberSnapshot: '128', order: { status: 'preparing' } },
    ]);
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.ASSIGNED,
      driver: { name: 'Ana' },
      kdsOverrideAt: null,
      kdsOverrideBy: null,
      kdsOverrideReason: null,
    }));

    const blocked = await service.getDriverWorkState('tenant-a', 'driver-a');
    expect(blocked.activeRun).toMatchObject({
      kds: {
        blocked: true,
        blockingOrdersCount: 1,
        blockingOrderNumbers: ['128'],
        overrideApplied: false,
        overrideAt: null,
      },
    });
    expect(blocked.activeRun).not.toHaveProperty('kdsOverrideReason');
    expect(blocked.activeRun).not.toHaveProperty('kdsOverrideBy');

    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.ASSIGNED,
      driver: { name: 'Ana' },
      kdsOverrideAt: new Date('2026-08-14T12:00:00.000Z'),
      kdsOverrideBy: 'manager-a',
      kdsOverrideReason: 'Liberação auditada',
    }));

    await expect(service.getDriverWorkState('tenant-a', 'driver-a')).resolves.toMatchObject({
      activeRun: {
        kds: {
          blocked: false,
          blockingOrdersCount: 1,
          overrideApplied: true,
          overrideAt: '2026-08-14T12:00:00.000Z',
        },
      },
    });
  });

  it('returns tenant-scoped detailed run history inside the retention window', async () => {
    tx.deliveryRun.findFirst.mockResolvedValue({
      id: 'run-a', driverId: 'driver-a', shiftId: 'shift-a',
      startedAt: new Date('2026-08-10T10:00:00.000Z'),
      completedAt: new Date('2026-08-10T11:00:00.000Z'),
    });
    prisma.deliveryDriverLocation.findMany.mockResolvedValue([{
      id: 'location-a', lat: -23.5, lng: -46.6,
      recordedAt: new Date('2026-08-10T10:30:00.000Z'),
      accuracy: 10, heading: null, speed: null, source: 'foreground',
    }]);

    const result = await service.getLocationHistory(
      'tenant-a', 'run-a', new Date('2026-08-12T12:00:00.000Z'),
    );
    expect(tx.deliveryRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-a', tenantId: 'tenant-a' },
    }));
    expect(prisma.deliveryDriverLocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', runId: 'run-a' }),
    }));
    expect(result).toEqual(expect.objectContaining({
      runId: 'run-a', detailedAvailable: true,
      points: [expect.objectContaining({ recordedAt: '2026-08-10T10:30:00.000Z' })],
    }));
  });

  it('keeps the run summary but omits detailed history after 30 days', async () => {
    tx.deliveryRun.findFirst.mockResolvedValue({
      id: 'run-old', driverId: 'driver-a', shiftId: 'shift-a',
      startedAt: new Date('2026-06-30T10:00:00.000Z'),
      completedAt: new Date('2026-07-01T11:00:00.000Z'),
    });
    const result = await service.getLocationHistory(
      'tenant-a', 'run-old', new Date('2026-08-12T12:00:00.000Z'),
    );
    expect(result.detailedAvailable).toBe(false);
    expect(result.points).toEqual([]);
    expect(prisma.deliveryDriverLocation.findMany).not.toHaveBeenCalled();
  });

  it('starts one tenant-scoped shift and treats a repeated start as idempotent', async () => {
    tx.deliveryDriver.findFirst.mockResolvedValue({ id: 'driver-a' });
    const existing = { id: 'shift-a', tenantId: 'tenant-a', driverId: 'driver-a', status: 'ACTIVE' };
    tx.driverShift.findFirst.mockResolvedValue(existing);

    await expect(service.startShift('tenant-a', 'driver-a')).resolves.toBe(existing);
    expect(tx.deliveryDriver.findFirst).toHaveBeenCalledWith({
      where: { id: 'driver-a', tenantId: 'tenant-a', isActive: true },
    });
    expect(tx.driverShift.create).not.toHaveBeenCalled();
  });

  it('allows availability changes without creating another paid shift for the same business date', async () => {
    tx.deliveryDriver.findFirst.mockResolvedValue({ id: 'driver-a' });
    tx.driverShift.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    tx.tenantSettings.findUnique.mockResolvedValue({ timezone: 'America/Sao_Paulo' });
    const created = { id: 'shift-a', tenantId: 'tenant-a', driverId: 'driver-a', businessDate: new Date(), status: 'ACTIVE' };
    tx.driverShift.create.mockResolvedValue(created);

    await expect(service.startShift('tenant-a', 'driver-a')).resolves.toBe(created);
    expect(tx.driverShift.create).toHaveBeenCalledTimes(1);
    expect(tx.deliveryDriver.update).toHaveBeenCalledWith({
      where: { id: 'driver-a' }, data: { status: 'offline', dispatchQueueJoinedAt: null },
    });
  });

  it('does not reveal a driver from another tenant while starting a shift', async () => {
    tx.deliveryDriver.findFirst.mockResolvedValue(null);
    await expect(service.startShift('tenant-b', 'driver-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.driverShift.findFirst).not.toHaveBeenCalled();
  });

  it('blocks shift completion while a route or return is active', async () => {
    tx.driverShift.findFirst.mockResolvedValue({ id: 'shift-a' });
    tx.deliveryRun.findFirst.mockResolvedValue({ id: 'run-a' });

    await expect(service.endShift('tenant-a', 'driver-a')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.deliveryRun.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        driverId: 'driver-a',
        status: { in: ['PENDING_ACCEPTANCE', 'ASSIGNED', 'IN_PROGRESS', 'RETURNING'] },
      },
      select: { id: true },
    });
  });

  it('posts the daily rate exactly once when the tenant closes a shift', async () => {
    const activeShift = {
      id: 'shift-a', tenantId: 'tenant-a', driverId: 'driver-a',
      dailyRateSnapshot: 50, currencySnapshot: 'BRL',
    };
    tx.driverShift.findFirst.mockResolvedValue(activeShift);
    tx.deliveryRun.findFirst.mockResolvedValue(null);
    tx.driverShift.update.mockResolvedValue({ ...activeShift, status: 'ENDED', endedAt: new Date() });

    await service.endShift('tenant-a', 'driver-a');
    expect(earnings.postDailyRate).toHaveBeenCalledTimes(1);
    expect(earnings.postDailyRate).toHaveBeenCalledWith(tx, activeShift);
  });

  it('creates a multi-order route with stable manual sequence and address snapshots', async () => {
    tx.deliveryDriver.findFirst.mockResolvedValue({ id: 'driver-a' });
    tx.driverShift.findFirst.mockResolvedValue({ id: 'shift-a' });
    tx.order.findMany.mockResolvedValue([
      {
        id: 'order-2', orderNumber: '2', customerName: 'B', customerPhone: '22',
        marketplaceOrders: [],
        deliveryAddress: { street: 'B', number: '2', complement: null, neighborhood: 'N', city: 'C', state: 'SP', zipCode: '2', reference: null, lat: null, lng: null },
      },
      {
        id: 'order-1', orderNumber: '1', customerName: 'A', customerPhone: '11',
        marketplaceOrders: [],
        deliveryAddress: { street: 'A', number: '1', complement: null, neighborhood: 'N', city: 'C', state: 'SP', zipCode: '1', reference: null, lat: null, lng: null },
      },
    ]);
    tx.deliveryRun.create.mockResolvedValue(baseRun());

    await service.createRun('tenant-a', 'driver-a', ['order-1', 'order-2'], 'user-a');

    const createCall = tx.deliveryRun.create.mock.calls[0][0];
    expect(createCall.data.stops.create.map((stop: { orderId: string; sequence: number }) => ({
      orderId: stop.orderId,
      sequence: stop.sequence,
    }))).toEqual([
      { orderId: 'order-1', sequence: 1 },
      { orderId: 'order-2', sequence: 2 },
    ]);
    expect(tx.deliveryDriver.update).toHaveBeenCalledWith({
      where: { id: 'driver-a' }, data: { status: 'busy', dispatchQueueJoinedAt: null },
    });
  });

  it('auto-accepts assignment only when the tenant setting disables acceptance', async () => {
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      stops: [{ id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.PENDING }],
    }));
    tx.tenantSettings.findUnique.mockResolvedValue({ deliveryRunRequiresAcceptance: false });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.deliveryRun.update.mockResolvedValue(baseRun({ status: DeliveryRunStatus.ASSIGNED }));

    await service.assignRun('tenant-a', 'run-a', 'user-a');
    expect(tx.deliveryRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: DeliveryRunStatus.ASSIGNED }),
    }));
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', id: { in: ['order-a'] } },
      data: { deliveryDriverId: 'driver-a' },
    });
  });

  it('returns only tenant-scoped free drivers and orders outside active routes', async () => {
    tx.deliveryDriver.findMany.mockResolvedValue([{
      id: 'driver-a', tenantId: 'tenant-a', name: 'Ana', phone: '11', pin: 'secret',
      isActive: true, status: 'available', vehicleType: 'motorcycle', notes: null,
      currentLat: null, currentLng: null, lastLocationAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    }]);
    tx.order.findMany.mockResolvedValue([{
      id: 'order-a', orderNumber: '10', customerName: 'Cliente', customerPhone: '11',
      marketplaceOrders: [],
      createdAt: new Date('2026-08-11T12:00:00.000Z'),
      deliveryAddress: { street: 'Rua A', number: '1', neighborhood: 'Centro' },
    }]);

    const result = await service.getBuilderData('tenant-a');
    expect(tx.deliveryDriver.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', status: 'available' }),
    }));
    expect(tx.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        status: 'ready_for_delivery',
        deliveryStops: { none: { status: { in: ['PENDING', 'CURRENT', 'ARRIVED', 'FAILED_ATTEMPT', 'RETURN_TO_STORE'] } } },
      }),
    }));
    expect(result.drivers[0]).not.toHaveProperty('pin');
    expect(result.orders[0].address).toContain('Rua A');
  });

  it('keeps only native and merchant-owned orders in builder data', async () => {
    tx.deliveryDriver.findMany.mockResolvedValue([]);
    const order = (id: string, marketplaceOrders: Array<{ provider: 'IFOOD'; deliveryOwnership: 'MERCHANT' | 'PROVIDER' | 'UNKNOWN' }>) => ({
      id, orderNumber: id, customerName: 'Cliente', customerPhone: '11', createdAt: new Date(),
      deliveryAddress: null, marketplaceOrders,
    });
    tx.order.findMany.mockResolvedValue([
      order('native', []),
      order('merchant', [{ provider: 'IFOOD', deliveryOwnership: 'MERCHANT' }]),
      order('provider', [{ provider: 'IFOOD', deliveryOwnership: 'PROVIDER' }]),
      order('unknown', [{ provider: 'IFOOD', deliveryOwnership: 'UNKNOWN' }]),
    ]);

    const result = await service.getBuilderData('tenant-a');
    expect(result.orders.map((item) => item.id)).toEqual(['native', 'merchant']);
  });

  it('resolves an order route without crossing tenant boundaries', async () => {
    tx.deliveryStop.findFirst.mockResolvedValue({ runId: 'run-a' });
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({ driver: { name: 'Ana' } }));
    await expect(service.getRunForTenantOrder('tenant-a', 'order-a'))
      .resolves.toEqual(expect.objectContaining({ id: 'run-a', driverName: 'Ana' }));
    expect(tx.deliveryStop.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', orderId: 'order-a' },
      orderBy: { createdAt: 'desc' },
      select: { runId: true },
    });
    expect(tx.deliveryRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', id: 'run-a' },
    }));
  });

  it('creates and assigns the complete route in the same transaction', async () => {
    tx.deliveryDriver.findFirst.mockResolvedValue({ id: 'driver-a' });
    tx.driverShift.findFirst.mockResolvedValue({ id: 'shift-a' });
    tx.tenantSettings.findUnique.mockResolvedValue({ deliveryRunRequiresAcceptance: true });
    tx.order.findMany.mockResolvedValue([
      { id: 'order-c', orderNumber: '3', customerName: 'C', customerPhone: '33', deliveryAddress: null, marketplaceOrders: [] },
      { id: 'order-a', orderNumber: '1', customerName: 'A', customerPhone: '11', deliveryAddress: null, marketplaceOrders: [] },
      { id: 'order-b', orderNumber: '2', customerName: 'B', customerPhone: '22', deliveryAddress: null, marketplaceOrders: [] },
    ]);
    tx.deliveryRun.create.mockResolvedValue(baseRun({ assignedAt: new Date() }));
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      assignedAt: new Date(),
      driver: { name: 'Ana' },
      stops: [],
    }));
    tx.order.updateMany.mockResolvedValue({ count: 3 });

    await service.createAssignedRun(
      'tenant-a',
      'driver-a',
      ['order-a', 'order-b', 'order-c'],
      'user-a',
    );
    expect(tx.deliveryRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assignedAt: expect.any(Date),
        status: DeliveryRunStatus.PENDING_ACCEPTANCE,
      }),
    }));
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        id: { in: ['order-a', 'order-b', 'order-c'] },
        status: 'ready_for_delivery',
      },
      data: { deliveryDriverId: 'driver-a' },
    });
    const createCall = tx.deliveryRun.create.mock.calls[0][0];
    expect(createCall.data.stops.create.map((stop: { orderId: string; sequence: number }) => ({
      orderId: stop.orderId,
      sequence: stop.sequence,
    }))).toEqual([
      { orderId: 'order-a', sequence: 1 },
      { orderId: 'order-b', sequence: 2 },
      { orderId: 'order-c', sequence: 3 },
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('creates a route for an explicitly merchant-owned marketplace order', async () => {
    tx.deliveryDriver.findFirst.mockResolvedValue({ id: 'driver-a' });
    tx.driverShift.findFirst.mockResolvedValue({ id: 'shift-a' });
    tx.tenantSettings.findUnique.mockResolvedValue({ deliveryRunRequiresAcceptance: true });
    tx.order.findMany.mockResolvedValue([{
      id: 'order-a', orderNumber: '1', customerName: 'A', customerPhone: '11', deliveryAddress: null,
      marketplaceOrders: [{ provider: 'IFOOD', deliveryOwnership: 'MERCHANT' }],
    }]);
    tx.deliveryRun.create.mockResolvedValue(baseRun());

    await expect(service.createRun('tenant-a', 'driver-a', ['order-a'])).resolves.toEqual(baseRun());
    expect(tx.deliveryRun.create).toHaveBeenCalledTimes(1);
  });

  it.each(['PROVIDER', 'UNKNOWN'] as const)(
    'rejects %s marketplace ownership repeatedly before any run, stop, order, or driver write',
    async (deliveryOwnership) => {
      tx.deliveryDriver.findFirst.mockResolvedValue({ id: 'driver-a' });
      tx.driverShift.findFirst.mockResolvedValue({ id: 'shift-a' });
      tx.tenantSettings.findUnique.mockResolvedValue({ deliveryRunRequiresAcceptance: true });
      tx.order.findMany.mockResolvedValue([{
        id: 'order-a', orderNumber: '1', customerName: 'A', customerPhone: '11', deliveryAddress: null,
        marketplaceOrders: [{ provider: 'IFOOD', deliveryOwnership }],
      }]);

      await expect(service.createAssignedRun('tenant-a', 'driver-a', ['order-a'], 'manager-a')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.createAssignedRun('tenant-a', 'driver-a', ['order-a'], 'manager-a')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.deliveryRun.create).not.toHaveBeenCalled();
      expect(tx.order.updateMany).not.toHaveBeenCalled();
      expect(tx.deliveryDriver.update).not.toHaveBeenCalled();
    },
  );

  it('starts all orders atomically and selects only the first stop as current', async () => {
    const stops = [
      { id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.PENDING },
      { id: 'stop-b', orderId: 'order-b', sequence: 2, status: DeliveryStopStatus.PENDING },
    ];
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.ASSIGNED,
      assignedAt: new Date(),
      acceptedAt: new Date(),
      stops,
    }));
    tx.order.findMany.mockResolvedValue([
      { id: 'order-a', status: 'ready_for_delivery' },
      { id: 'order-b', status: 'ready_for_delivery' },
    ]);
    tx.deliveryRun.update.mockResolvedValue(baseRun({ status: DeliveryRunStatus.IN_PROGRESS, stops }));

    await service.startRun('tenant-a', 'run-a', 'driver-a');
    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledTimes(2);
    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenNthCalledWith(1, tx, {
      tenantId: 'tenant-a',
      orderId: 'order-a',
      expectedCurrentStatus: 'ready_for_delivery',
      targetStatus: 'out_for_delivery',
      expectedDeliveryDriverId: 'driver-a',
    });
    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenNthCalledWith(2, tx, {
      tenantId: 'tenant-a',
      orderId: 'order-b',
      expectedCurrentStatus: 'ready_for_delivery',
      targetStatus: 'out_for_delivery',
      expectedDeliveryDriverId: 'driver-a',
    });
    expect(tx.orderTimeline.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ orderId: 'order-a', status: 'out_for_delivery' }),
        expect.objectContaining({ orderId: 'order-b', status: 'out_for_delivery' }),
      ]),
    });
    expect(tx.deliveryStop.update).toHaveBeenCalledWith({
      where: { id: 'stop-a' }, data: { status: DeliveryStopStatus.CURRENT },
    });
    expect(gateway.emitOrderChanged).toHaveBeenCalledTimes(2);
  });

  it('completes an arrived stop through the primitive before persisting stop, earnings, and route effects', async () => {
    const stop = { id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.ARRIVED, payAttemptSnapshot: false };
    tx.deliveryRun.findFirst
      .mockResolvedValueOnce(baseRun({ status: DeliveryRunStatus.IN_PROGRESS, stops: [stop] }))
      .mockResolvedValueOnce(baseRun({ status: DeliveryRunStatus.COMPLETED, stops: [{ ...stop, status: DeliveryStopStatus.DELIVERED }] }));
    tx.order.findFirst.mockResolvedValue({ id: 'order-a', status: 'out_for_delivery' });
    tx.deliveryStop.findMany.mockResolvedValue([{ ...stop, status: DeliveryStopStatus.DELIVERED }]);
    tx.deliveryRun.update.mockResolvedValue(baseRun({ status: DeliveryRunStatus.COMPLETED }));

    await service.completeStop('tenant-a', 'run-a', 'stop-a', 'driver-a');

    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledWith(tx, {
      tenantId: 'tenant-a',
      orderId: 'order-a',
      expectedCurrentStatus: 'out_for_delivery',
      targetStatus: 'completed',
    });
    expect(tx.deliveryStop.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'stop-a' },
      data: expect.objectContaining({ status: DeliveryStopStatus.DELIVERED }),
    }));
    expect(earnings.postStop).toHaveBeenCalledTimes(1);
    expect(gateway.emitOrderChanged).toHaveBeenCalledWith('tenant-a', 'order-a', 'status');
  });

  it('keeps an already started run idempotent without replaying order transitions', async () => {
    const stops = [{ id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.CURRENT }];
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({ status: DeliveryRunStatus.IN_PROGRESS, stops }));

    await service.startRun('tenant-a', 'run-a', 'driver-a');

    expect(ordersService.applyOrderStatusTransitionInTransaction).not.toHaveBeenCalled();
    expect(gateway.emitOrderChanged).toHaveBeenCalledWith('tenant-a', 'order-a', 'status');
  });

  it('keeps an already delivered stop idempotent without replaying the order transition', async () => {
    const stop = { id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.DELIVERED };
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({ status: DeliveryRunStatus.COMPLETED, stops: [stop] }));

    await service.completeStop('tenant-a', 'run-a', 'stop-a', 'driver-a');

    expect(ordersService.applyOrderStatusTransitionInTransaction).not.toHaveBeenCalled();
    expect(gateway.emitOrderChanged).toHaveBeenCalledWith('tenant-a', 'order-a', 'status');
  });

  it('keeps startRun all-or-nothing when one of multiple canonical transitions is stale', async () => {
    const stops = [
      { id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.PENDING },
      { id: 'stop-b', orderId: 'order-b', sequence: 2, status: DeliveryStopStatus.PENDING },
    ];
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.ASSIGNED,
      assignedAt: new Date(),
      acceptedAt: new Date(),
      stops,
    }));
    tx.order.findMany.mockResolvedValue([
      { id: 'order-a', status: 'ready_for_delivery' },
      { id: 'order-b', status: 'ready_for_delivery' },
    ]);
    ordersService.applyOrderStatusTransitionInTransaction
      .mockResolvedValueOnce({ updatedOrder: { id: 'order-a', status: 'out_for_delivery' } })
      .mockRejectedValueOnce(new ConflictException({ code: 'ORDER_STATUS_STALE' }));

    await expect(service.startRun('tenant-a', 'run-a', 'driver-a')).rejects.toBeInstanceOf(ConflictException);

    expect(tx.deliveryStop.update).not.toHaveBeenCalled();
    expect(tx.deliveryRun.update).not.toHaveBeenCalled();
    expect(gateway.emitOrderChanged).not.toHaveBeenCalled();
  });

  it('does not emit order.changed when a related completeStop mutation aborts the transaction', async () => {
    const stop = { id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.ARRIVED, payAttemptSnapshot: false };
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({ status: DeliveryRunStatus.IN_PROGRESS, stops: [stop] }));
    tx.order.findFirst.mockResolvedValue({ id: 'order-a', status: 'out_for_delivery' });
    tx.deliveryStop.update.mockRejectedValueOnce(new Error('stop write failed'));

    await expect(service.completeStop('tenant-a', 'run-a', 'stop-a', 'driver-a')).rejects.toThrow('stop write failed');

    expect(ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledTimes(1);
    expect(gateway.emitOrderChanged).not.toHaveBeenCalled();
  });

  it('blocks start with an explicit kitchen message while an order is preparing', async () => {
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.ASSIGNED,
      assignedAt: new Date(),
      acceptedAt: new Date(),
      stops: [{ id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.PENDING }],
    }));
    tx.order.findMany.mockResolvedValue([{ id: 'order-a', status: 'preparing' }]);
    await expect(service.startRun('tenant-a', 'run-a', 'driver-a'))
      .rejects.toThrow('A rota ainda possui pedidos em preparo');
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('applies a run-scoped audited override without changing order status', async () => {
    const run = baseRun({ status: DeliveryRunStatus.ASSIGNED, driver: { name: 'Ana' } });
    tx.deliveryRun.findFirst.mockResolvedValueOnce(run).mockResolvedValueOnce(run);
    tx.deliveryRun.update.mockResolvedValue(run);
    await service.overrideKdsLock('tenant-a', 'run-a', 'manager-a', 'Pedido autorizado pelo gestor');
    expect(tx.deliveryRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-a' },
      data: expect.objectContaining({ kdsOverrideBy: 'manager-a', kdsOverrideReason: 'Pedido autorizado pelo gestor' }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-a', userId: 'manager-a' }) }));
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent reorder through the route version', async () => {
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.IN_PROGRESS,
      version: 3,
      stops: [{ id: 'stop-b', sequence: 2, status: DeliveryStopStatus.PENDING }],
    }));

    await expect(service.reorderStops('tenant-a', 'run-a', ['stop-b'], 2)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.deliveryStop.updateMany).not.toHaveBeenCalled();
  });

  it('reorders every pending stop before the route starts', async () => {
    const stops = [
      { id: 'stop-a', sequence: 1, status: DeliveryStopStatus.PENDING },
      { id: 'stop-b', sequence: 2, status: DeliveryStopStatus.PENDING },
      { id: 'stop-c', sequence: 3, status: DeliveryStopStatus.PENDING },
    ];
    tx.deliveryRun.findFirst
      .mockResolvedValueOnce(baseRun({
        status: DeliveryRunStatus.ASSIGNED,
        version: 2,
        stops,
      }))
      .mockResolvedValueOnce(baseRun({
        status: DeliveryRunStatus.ASSIGNED,
        version: 3,
        stops: [stops[2], stops[0], stops[1]],
      }));

    await service.reorderStops(
      'tenant-a',
      'run-a',
      ['stop-c', 'stop-a', 'stop-b'],
      2,
      'user-a',
    );

    expect(tx.deliveryStop.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: 'tenant-a',
        runId: 'run-a',
        id: { in: ['stop-c', 'stop-a', 'stop-b'] },
      },
      data: { sequence: { increment: 1_000_000 } },
    });
    expect(tx.deliveryStop.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'stop-c',
        tenantId: 'tenant-a',
        runId: 'run-a',
        status: DeliveryStopStatus.PENDING,
      },
      data: { sequence: 1 },
    });
    expect(tx.deliveryRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-a', tenantId: 'tenant-a', version: 2 },
      data: expect.objectContaining({ version: { increment: 1 } }),
    }));
  });

  it('turns a failed attempt into a durable return without cancelling the order', async () => {
    const stop = { id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.ARRIVED };
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.IN_PROGRESS,
      stops: [stop],
    }));
    tx.deliveryStop.findMany.mockResolvedValue([{ ...stop, status: DeliveryStopStatus.RETURN_TO_STORE }]);
    tx.deliveryRun.update.mockResolvedValue(baseRun({ status: DeliveryRunStatus.RETURNING }));

    await service.markFailedAttempt('tenant-a', 'run-a', 'stop-a', 'driver-a', 'Cliente ausente');
    expect(tx.deliveryStop.update).toHaveBeenCalledWith({
      where: { id: 'stop-a' },
      data: expect.objectContaining({
        status: DeliveryStopStatus.RETURN_TO_STORE,
        failureReason: 'Cliente ausente',
      }),
    });
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.deliveryDriver.update).not.toHaveBeenCalled();
  });

  it('refuses final completion while a return is pending', async () => {
    tx.deliveryRun.findFirst.mockResolvedValue(baseRun({
      status: DeliveryRunStatus.RETURNING,
      stops: [{ id: 'stop-a', status: DeliveryStopStatus.RETURN_TO_STORE }],
    }));
    tx.deliveryStop.count.mockResolvedValue(1);

    await expect(service.completeRun('tenant-a', 'run-a', 'driver-a')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.deliveryDriver.update).not.toHaveBeenCalled();
  });
});
