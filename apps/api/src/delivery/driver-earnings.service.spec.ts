import { DriverPayMode, Prisma } from '@prisma/client';
import { DriverEarningsService } from './driver-earnings.service';

describe('DriverEarningsService pay snapshots', () => {
  const prisma = {};
  const service = new DriverEarningsService(prisma as never);
  const settings = {
    driverPayMode: DriverPayMode.NORMAL_DELIVERY_FEE,
    driverDailyRate: new Prisma.Decimal(50),
    driverPayFixedAmount: new Prisma.Decimal(7),
    driverPayPercentage: new Prisma.Decimal(80),
    driverPayRateTable: [{ upToKm: 3, amount: 5 }, { upToKm: null, amount: 14 }],
    driverPayFailedAttempt: true,
    currency: 'BRL', lat: -23.55, lng: -46.63,
  };
  const storeDefault = {
    payOverrideEnabled: false, payMode: null, dailyRate: null, payFixedAmount: null,
    payPercentage: null, payRateTable: null, payFailedAttempt: null,
  };
  const order = { normalDeliveryFee: new Prisma.Decimal(12), deliveryLat: -23.56, deliveryLng: -46.64 };

  it('uses the normal pre-discount fee even when customer delivery fee is free', () => {
    const snapshot = service.stopSnapshot(storeDefault, settings, order, settings);
    expect(Number(snapshot.payAmountSnapshot)).toBe(12);
    expect(Number(snapshot.payBaseSnapshot)).toBe(12);
  });

  it('calculates percentage, fixed and own distance table modes', () => {
    expect(Number(service.stopSnapshot({ ...storeDefault, payOverrideEnabled: true,
      payMode: DriverPayMode.PERCENTAGE_NORMAL_FEE, payPercentage: new Prisma.Decimal(80) }, settings, order, settings).payAmountSnapshot)).toBe(9.6);
    expect(Number(service.stopSnapshot({ ...storeDefault, payOverrideEnabled: true,
      payMode: DriverPayMode.FIXED, payFixedAmount: new Prisma.Decimal(7) }, settings, order, settings).payAmountSnapshot)).toBe(7);
    expect(Number(service.stopSnapshot({ ...storeDefault, payOverrideEnabled: true,
      payMode: DriverPayMode.DRIVER_RATE_TABLE, payRateTable: settings.driverPayRateTable }, settings, order, settings).payAmountSnapshot)).toBe(5);
  });

  it('freezes the applied configuration in the stop snapshot', () => {
    const snapshot = service.stopSnapshot(storeDefault, settings, order, settings);
    settings.driverPayFixedAmount = new Prisma.Decimal(99);
    expect(Number(snapshot.payAmountSnapshot)).toBe(12);
    expect(snapshot.payAttemptSnapshot).toBe(true);
  });
});

describe('DriverEarningsService ledger posting', () => {
  const prisma = {
    driverLedgerEntry: { createMany: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    driverShift: { findFirst: jest.fn() }, deliveryStop: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const service = new DriverEarningsService(prisma as never);
  const tx = { driverLedgerEntry: prisma.driverLedgerEntry };
  const stop = { id: 'stop-a', tenantId: 'tenant-a', orderId: 'order-a', runId: 'run-a',
    arrivedAt: new Date(), payAmountSnapshot: new Prisma.Decimal(8), payCurrencySnapshot: 'BRL',
    run: { driverId: 'driver-a', shiftId: 'shift-a' } };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.deliveryStop.findMany.mockResolvedValue([]);
  });

  it('posts delivery and paid attempt with a stable idempotency source key', async () => {
    await service.postStop(tx as never, stop, 'delivered', false);
    await service.postStop(tx as never, stop, 'attempt', true);
    expect(prisma.driverLedgerEntry.createMany).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ skipDuplicates: true, data: [expect.objectContaining({ sourceKey: 'stop-pay:stop-a', amount: stop.payAmountSnapshot })] }));
    expect(prisma.driverLedgerEntry.createMany).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ skipDuplicates: true, data: [expect.objectContaining({ sourceKey: 'stop-pay:stop-a' })] }));
  });

  it('does not pay an attempt before arrival or when disabled', async () => {
    await service.postStop(tx as never, { ...stop, arrivedAt: null }, 'attempt', true);
    await service.postStop(tx as never, stop, 'cancelled', false);
    expect(prisma.driverLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('derives cash tips as already received and excludes them from due to store', async () => {
    prisma.driverShift.findFirst.mockResolvedValue({ id: 'shift-a', tenantId: 'tenant-a', driverId: 'driver-a',
      status: 'ENDED', dailyRateSnapshot: new Prisma.Decimal(50), currencySnapshot: 'BRL' });
    prisma.driverLedgerEntry.findMany.mockResolvedValue([
      { type: 'DELIVERY_FEE', amount: new Prisma.Decimal(8), receivedDirectlyByDriver: false },
      { type: 'TIP_CASH', amount: new Prisma.Decimal(10), receivedDirectlyByDriver: true },
      { type: 'DAILY_RATE', amount: new Prisma.Decimal(50), receivedDirectlyByDriver: false },
    ]);
    const summary = await service.summary('tenant-a', 'driver-a');
    expect(summary).toMatchObject({ totalEarnings: 68, receivedDirectly: 10, dueFromStore: 58,
      eligibleCashTipOrders: [] });
  });

  it('uses one canonical cash-tip key per stop across driver and tenant retries', async () => {
    prisma.deliveryStop.findFirst.mockResolvedValue({ ...stop, run: stop.run });
    prisma.driverLedgerEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ amount: new Prisma.Decimal(10) });
    prisma.driverShift.findFirst.mockResolvedValue({ id: 'shift-a', tenantId: 'tenant-a', driverId: 'driver-a',
      status: 'ACTIVE', dailyRateSnapshot: new Prisma.Decimal(0), currencySnapshot: 'BRL' });
    prisma.driverLedgerEntry.findMany.mockResolvedValue([]);

    await service.addCashTip('tenant-a', 'driver-a', 'order-a', 10, 'driver-a', 'delivery_driver');

    expect(prisma.driverLedgerEntry.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ sourceKey: 'cash-tip:stop-a' })],
    }));
  });

  it('rejects a divergent cash tip when the stop already has one', async () => {
    prisma.deliveryStop.findFirst.mockResolvedValue({ ...stop, run: stop.run });
    prisma.driverLedgerEntry.findFirst.mockResolvedValue({ amount: new Prisma.Decimal(10) });

    await expect(service.addCashTip('tenant-a', 'driver-a', 'order-a', 12, 'manager-a', 'tenant_user'))
      .rejects.toThrow('jÃƒÂ¡ possui uma gorjeta');
    expect(prisma.driverLedgerEntry.createMany).not.toHaveBeenCalled();
  });
});
