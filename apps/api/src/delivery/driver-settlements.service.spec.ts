import { ConflictException } from '@nestjs/common';
import { DriverLedgerEntryType, DriverSettlementMethod, DriverShiftStatus, Prisma } from '@prisma/client';
import { DriverSettlementMethod as SharedSettlementMethod, DriverShiftPaymentStatus } from '@gestor/types';
import { DriverSettlementsService } from './driver-settlements.service';

const decimal = (value: number) => new Prisma.Decimal(value);

function shift(overrides: Record<string, unknown> = {}) {
  return {
    id: 'shift-a', tenantId: 'tenant-a', driverId: 'driver-a', status: DriverShiftStatus.ENDED,
    startedAt: new Date('2026-08-08T10:00:00Z'), endedAt: new Date('2026-08-08T18:00:00Z'),
    createdAt: new Date(), updatedAt: new Date(), dailyRateSnapshot: decimal(50), currencySnapshot: 'BRL',
    paySnapshotAt: new Date(), settlementItem: null, runs: [],
    ledgerEntries: [
      { id: 'daily-a', type: DriverLedgerEntryType.DAILY_RATE, amount: decimal(50), receivedDirectlyByDriver: false },
      { id: 'delivery-a', type: DriverLedgerEntryType.DELIVERY_FEE, amount: decimal(32), receivedDirectlyByDriver: false },
      { id: 'tip-a', type: DriverLedgerEntryType.TIP_CASH, amount: decimal(10), receivedDirectlyByDriver: true },
    ],
    ...overrides,
  };
}

describe('DriverSettlementsService', () => {
  const prisma = {
    deliveryDriver: { findFirst: jest.fn() },
    driverShift: { findMany: jest.fn() },
    driverSettlement: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    tenantUser: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new DriverSettlementsService(prisma as never);
  const dto = { driverId: 'driver-a', shiftIds: ['shift-a'], paymentMethod: SharedSettlementMethod.PIX, idempotencyKey: 'payment-a' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.deliveryDriver.findFirst.mockResolvedValue({ id: 'driver-a' });
    prisma.tenantUser.findMany.mockResolvedValue([{ id: 'manager-a', name: 'Emerson' }]);
    prisma.driverSettlement.findMany.mockResolvedValue([]);
    prisma.driverSettlement.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
  });

  it('lists only closed eligible shifts and excludes cash tips from due', async () => {
    prisma.driverShift.findMany.mockResolvedValue([shift()]);
    const result = await service.listShifts('tenant-a', 'driver-a', DriverShiftPaymentStatus.PENDING);
    expect(result).toEqual([expect.objectContaining({ grossEarnings: 92, receivedDirectly: 10, amountDue: 82 })]);
  });

  it('uses immutable settlement snapshots when listing a paid shift', async () => {
    prisma.driverShift.findMany.mockResolvedValue([shift({
      ledgerEntries: [
        { id: 'daily-a', type: DriverLedgerEntryType.DAILY_RATE, amount: decimal(50), receivedDirectlyByDriver: false },
        { id: 'delivery-a', type: DriverLedgerEntryType.DELIVERY_FEE, amount: decimal(32), receivedDirectlyByDriver: false },
        { id: 'late-tip', type: DriverLedgerEntryType.TIP_CASH, amount: decimal(15), receivedDirectlyByDriver: true },
      ],
      settlementItem: {
        settlementId: 'paid-a', grossEarnings: decimal(92), receivedDirectly: decimal(10), amountDue: decimal(82),
      },
    })]);

    const result = await service.listShifts('tenant-a', 'driver-a', DriverShiftPaymentStatus.PAID);

    expect(result).toEqual([expect.objectContaining({ grossEarnings: 92, receivedDirectly: 10, amountDue: 82 })]);
  });

  it('blocks an active shift and a closed shift with an open return route', async () => {
    prisma.driverShift.findMany.mockResolvedValue([
      shift({ id: 'active', status: DriverShiftStatus.ACTIVE, endedAt: null }),
      shift({ id: 'returning', runs: [{ status: 'RETURNING' }] }),
    ]);
    await expect(service.listShifts('tenant-a', 'driver-a', DriverShiftPaymentStatus.PENDING)).resolves.toEqual([]);
  });

  it('creates one settlement for one or multiple whole shifts using backend totals', async () => {
    const second = shift({ id: 'shift-b', ledgerEntries: [
      { id: 'daily-b', type: DriverLedgerEntryType.DAILY_RATE, amount: decimal(50), receivedDirectlyByDriver: false },
      { id: 'delivery-b', type: DriverLedgerEntryType.DELIVERY_FEE, amount: decimal(26), receivedDirectlyByDriver: false },
    ] });
    prisma.driverShift.findMany.mockResolvedValue([shift(), second]);
    prisma.driverSettlement.create.mockResolvedValue({ id: 'settlement-a' });
    prisma.driverSettlement.findFirst.mockResolvedValue({
      id: 'settlement-a', tenantId: 'tenant-a', driverId: 'driver-a', amount: decimal(158), currency: 'BRL',
      paymentMethod: DriverSettlementMethod.PIX, paidAt: new Date(), notes: null, createdBy: 'manager-a',
      idempotencyKey: 'payment-a', createdAt: new Date(), items: [],
    });
    await service.create('tenant-a', 'manager-a', { ...dto, shiftIds: ['shift-a', 'shift-b'] });
    expect(prisma.driverSettlement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      amount: decimal(158), items: { create: expect.arrayContaining([
        expect.objectContaining({ shiftId: 'shift-a', amountDue: decimal(82) }),
        expect.objectContaining({ shiftId: 'shift-b', amountDue: decimal(76) }),
      ]) },
    }) }));
  });

  it('returns the existing settlement for an identical idempotent retry', async () => {
    const existing = {
      id: 'settlement-a', tenantId: 'tenant-a', driverId: 'driver-a', amount: decimal(82), currency: 'BRL',
      paymentMethod: DriverSettlementMethod.PIX, paidAt: new Date(), notes: null, createdBy: 'manager-a',
      idempotencyKey: 'payment-a', createdAt: new Date(),
      items: [{ id: 'item-a', tenantId: 'tenant-a', settlementId: 'settlement-a', shiftId: 'shift-a',
        grossEarnings: decimal(92), receivedDirectly: decimal(10), amountDue: decimal(82), createdAt: new Date(), shift: shift() }],
    };
    prisma.driverSettlement.findUnique.mockResolvedValue(existing);
    prisma.driverSettlement.findFirst.mockResolvedValue(existing);
    const result = await service.create('tenant-a', 'manager-a', dto);
    expect(result.id).toBe('settlement-a');
    expect(prisma.driverSettlement.create).not.toHaveBeenCalled();
  });

  it('blocks a paid shift and cross-tenant or cross-driver shift selection', async () => {
    prisma.driverShift.findMany.mockResolvedValue([shift({ settlementItem: { settlementId: 'paid-a', amountDue: decimal(82) } })]);
    await expect(service.create('tenant-a', 'manager-a', dto)).rejects.toBeInstanceOf(ConflictException);
    prisma.driverShift.findMany.mockResolvedValue([]);
    await expect(service.create('tenant-a', 'manager-a', dto)).rejects.toThrow('não pertencem');
  });

  it('turns a concurrent unique constraint race into a conflict without touching ledger', async () => {
    prisma.driverShift.findMany.mockResolvedValue([shift()]);
    prisma.driverSettlement.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002', clientVersion: '5.0.0', meta: { target: ['tenant_id', 'shift_id'] },
    }));
    await expect(service.create('tenant-a', 'manager-a', dto)).rejects.toBeInstanceOf(ConflictException);
    expect(Object.keys(prisma)).not.toContain('driverLedgerEntry');
  });

  it('turns a serializable transaction conflict between managers into a safe conflict', async () => {
    prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034', clientVersion: '5.0.0',
    }));
    await expect(service.create('tenant-a', 'manager-b', dto)).rejects.toThrow('outro gestor');
  });

  it('requires the daily ledger entry when a positive daily snapshot applies', async () => {
    prisma.driverShift.findMany.mockResolvedValue([shift({ ledgerEntries: [
      { id: 'delivery-a', type: DriverLedgerEntryType.DELIVERY_FEE, amount: decimal(32), receivedDirectlyByDriver: false },
    ] })]);
    await expect(service.create('tenant-a', 'manager-a', dto)).rejects.toBeInstanceOf(ConflictException);
  });
});
