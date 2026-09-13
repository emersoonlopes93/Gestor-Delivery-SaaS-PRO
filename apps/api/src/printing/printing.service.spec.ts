import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrintJobStatus } from '@prisma/client';
import { PrintingService } from './printing.service';

describe('PrintingService print station bootstrap', () => {
  const makeDb = () => ({
    productCategory: {
      findMany: jest.fn(),
    },
    printJob: {
      groupBy: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    printStation: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
    },
    printerDevice: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    order: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  });

  const makeService = (db: ReturnType<typeof makeDb>, legacyPrinter: { formatTicket?: jest.Mock } = {}) =>
    new PrintingService(db as never, legacyPrinter as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates print stations from active KDS category stations', async () => {
    const db = makeDb();
    db.productCategory.findMany.mockResolvedValue([
      { templateConfig: { station: 'Cozinha' } },
      { templateConfig: { station: 'Bebidas' } },
    ]);
    db.printJob.groupBy.mockResolvedValue([]);
    db.printStation.findMany.mockResolvedValue([
      { id: 'station-1', tenantId: 'tenant-1', name: 'Bebidas', slug: 'bebidas' },
      { id: 'station-2', tenantId: 'tenant-1', name: 'Cozinha', slug: 'cozinha' },
    ]);

    const result = await makeService(db).ensurePrintStationsForTenant('tenant-1');

    expect(result).toHaveLength(2);
    expect(db.productCategory.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true, deletedAt: null },
      select: { templateConfig: true },
    });
    expect(db.printStation.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', slug: 'cozinha' },
      select: { id: true },
    });
    expect(db.printStation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', name: 'Cozinha', slug: 'cozinha' }),
    }));
    expect(db.printStation.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', slug: 'bebidas' },
      select: { id: true },
    });
    expect(db.printStation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', name: 'Bebidas', slug: 'bebidas' }),
    }));
  });

  it('creates the default general station when no KDS sectors exist', async () => {
    const db = makeDb();
    db.productCategory.findMany.mockResolvedValue([]);
    db.printJob.groupBy.mockResolvedValue([]);
    db.printStation.findMany.mockResolvedValue([
      { id: 'station-general', tenantId: 'tenant-1', name: 'Geral / Balcao', slug: 'general' },
    ]);

    await makeService(db).ensurePrintStationsForTenant('tenant-1');

    expect(db.printStation.findFirst).toHaveBeenCalledTimes(1);
    expect(db.printStation.create).toHaveBeenCalledTimes(1);
    expect(db.printStation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        slug: 'general',
        isActive: true,
        autoPrintEnabled: false,
      }),
    }));
  });

  it('deduplicates repeated KDS stations before persisting by tenant slug', async () => {
    const db = makeDb();
    db.productCategory.findMany.mockResolvedValue([
      { templateConfig: { station: 'Cozinha' } },
      { templateConfig: { station: ' cozinha ' } },
    ]);
    db.printJob.groupBy.mockResolvedValue([
      { station: 'Cozinha' },
    ]);
    db.printStation.findMany.mockResolvedValue([]);

    await makeService(db).ensurePrintStationsForTenant('tenant-1');

    expect(db.printStation.findFirst).toHaveBeenCalledTimes(1);
    expect(db.printStation.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', slug: 'cozinha' },
      select: { id: true },
    });
    expect(db.printStation.create).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing station by tenant slug without reactivating it', async () => {
    const db = makeDb();
    db.printStation.findFirst.mockResolvedValue({ id: 'station-existing' });
    db.productCategory.findMany.mockResolvedValue([
      { templateConfig: { station: 'Area Fria' } },
    ]);
    db.printJob.groupBy.mockResolvedValue([]);
    db.printStation.findMany.mockResolvedValue([
      { id: 'station-existing', tenantId: 'tenant-1', name: 'Area Fria', slug: 'area-fria', isActive: true },
    ]);

    await makeService(db).ensurePrintStationsForTenant('tenant-1');

    expect(db.printStation.update).not.toHaveBeenCalled();
    expect(db.printStation.create).not.toHaveBeenCalled();
  });

  it('keeps station discovery and listing scoped to the current tenant', async () => {
    const db = makeDb();
    db.productCategory.findMany.mockResolvedValue([
      { templateConfig: { station: 'Cozinha' } },
    ]);
    db.printJob.groupBy.mockResolvedValue([
      { station: 'Balcao' },
    ]);
    db.printStation.findMany.mockResolvedValue([]);

    await makeService(db).ensurePrintStationsForTenant('tenant-a');

    expect(db.productCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a' }),
    }));
    expect(db.printJob.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        status: { notIn: [PrintJobStatus.completed, PrintJobStatus.failed] },
      }),
    }));
    expect(db.printStation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a' },
    }));
    for (const call of db.printStation.findFirst.mock.calls) {
      expect(call[0].where.tenantId).toBe('tenant-a');
    }
    for (const call of db.printStation.create.mock.calls) {
      expect(call[0].data.tenantId).toBe('tenant-a');
    }
  });

  it('accepts a same-tenant station when creating a device', async () => {
    const db = makeDb();
    db.printStation.findFirst.mockResolvedValue({ id: 'station-a' });
    db.printerDevice.create.mockResolvedValue({ id: 'device-a' });

    await makeService(db).createDevice('tenant-a', {
      stationId: 'station-a',
      name: 'Cozinha',
      connectionType: 'QZ_TRAY',
    });

    expect(db.printStation.findFirst).toHaveBeenCalledWith({
      where: { id: 'station-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(db.printerDevice.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-tenant station when creating a device', async () => {
    const db = makeDb();
    db.printStation.findFirst.mockResolvedValue(null);

    await expect(makeService(db).createDevice('tenant-a', {
      stationId: 'station-from-tenant-b',
      name: 'Cozinha',
      connectionType: 'QZ_TRAY',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(db.printerDevice.create).not.toHaveBeenCalled();
  });

  it('rejects a cross-tenant station when updating a device', async () => {
    const db = makeDb();
    db.printStation.findFirst.mockResolvedValue(null);

    await expect(makeService(db).updateDevice('tenant-a', 'device-a', {
      stationId: 'station-from-tenant-b',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(db.printerDevice.update).not.toHaveBeenCalled();
  });

  it('does not demote the current primary device when updating its preferences', async () => {
    const db = makeDb();
    db.printerDevice.findFirst.mockResolvedValue({ id: 'device-a', isPrimary: true });
    db.printerDevice.update.mockResolvedValue({ id: 'device-a', isPrimary: true, autoPrintEnabled: false });

    await makeService(db).updateDevice('tenant-a', 'device-a', { autoPrintEnabled: false });

    expect(db.printerDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', id: { not: 'device-a' }, isPrimary: true, isActive: true },
    }));
    expect(db.printerDevice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'device-a' },
      data: expect.objectContaining({ autoPrintEnabled: false }),
    }));
  });

  it('atomically returns a pending job to only one concurrent consumer', async () => {
    const db = makeDb();
    const state: {
      status: PrintJobStatus;
      lockedAt: Date | null;
      lockedBy: string | null;
    } = { status: PrintJobStatus.pending, lockedAt: null, lockedBy: null };
    db.printerDevice.findUnique.mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
      Promise.resolve({ id: where.id, tenantId: where.tenantId, isPrimary: true, station: null }));

    const tx = {
      printJob: {
        findFirst: jest.fn(({ select }: { select?: { id: boolean } }) => {
          if (select) return Promise.resolve(state.status === PrintJobStatus.pending ? { id: 'job-1' } : null);
          return Promise.resolve(state.lockedBy ? { id: 'job-1', tenantId: 'tenant-a', ...state } : null);
        }),
        updateMany: jest.fn(({ data }: { data: { lockedAt: Date; lockedBy: string } }) => {
          if (state.status !== PrintJobStatus.pending || state.lockedAt) return Promise.resolve({ count: 0 });
          state.status = PrintJobStatus.printing;
          state.lockedAt = data.lockedAt;
          state.lockedBy = data.lockedBy;
          return Promise.resolve({ count: 1 });
        }),
      },
    };
    db.$transaction.mockImplementation((operation: (client: typeof tx) => Promise<unknown>) => operation(tx));

    const service = makeService(db);
    const [consumerA, consumerB] = await Promise.all([
      service.getNextSpoolerJob('tenant-a', 'device-a'),
      service.getNextSpoolerJob('tenant-a', 'device-b'),
    ]);

    expect([consumerA, consumerB].filter(Boolean)).toHaveLength(1);
    expect([consumerA, consumerB].filter((job) => job === null)).toHaveLength(1);
    expect(tx.printJob.updateMany).toHaveBeenCalledTimes(2);
  });

  it('does not ack or fail a job through a device from another tenant', async () => {
    const db = makeDb();
    db.printerDevice.findFirst.mockResolvedValue(null);
    const service = makeService(db);

    await expect(service.ackSpoolerJob('tenant-a', 'job-a', 'foreign-device'))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.failSpoolerJob('tenant-a', 'job-a', 'foreign-device', 'offline'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(db.printJob.update).not.toHaveBeenCalled();
  });

  it('acks only the job locked by the same tenant device', async () => {
    const db = makeDb();
    db.printerDevice.findFirst.mockResolvedValue({ id: 'device-a' });
    db.printJob.findUnique.mockResolvedValue({ id: 'job-a', tenantId: 'tenant-a', lockedBy: 'device-a' });
    db.printJob.update.mockResolvedValue({ id: 'job-a', status: PrintJobStatus.completed });

    await makeService(db).ackSpoolerJob('tenant-a', 'job-a', 'device-a');

    expect(db.printJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-a' },
      data: expect.objectContaining({ status: PrintJobStatus.completed, lockedBy: null }),
    }));
  });

  it('releases a failed job for retry and marks it failed at the attempt limit', async () => {
    const db = makeDb();
    db.printerDevice.findFirst.mockResolvedValue({ id: 'device-a' });
    db.printJob.update.mockResolvedValue({ id: 'job-a' });
    const service = makeService(db);

    db.printJob.findUnique.mockResolvedValue({ id: 'job-a', lockedBy: 'device-a', attempts: 1, maxAttempts: 3 });
    await service.failSpoolerJob('tenant-a', 'job-a', 'device-a', 'offline');
    expect(db.printJob.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PrintJobStatus.pending, failedAt: null, lockedBy: null }),
    }));

    db.printJob.findUnique.mockResolvedValue({ id: 'job-a', lockedBy: 'device-a', attempts: 3, maxAttempts: 3 });
    await service.failSpoolerJob('tenant-a', 'job-a', 'device-a', 'offline');
    expect(db.printJob.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: PrintJobStatus.failed, failedAt: expect.any(Date) }),
    }));
  });

  it('never claims a job when the device is outside the active tenant', async () => {
    const db = makeDb();
    db.printerDevice.findUnique.mockResolvedValue(null);

    await expect(makeService(db).getNextSpoolerJob('tenant-a', 'device-from-tenant-b'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('creates one idempotent MAIN receipt job for an eligible order', async () => {
    const db = makeDb();
    const legacyPrinter = { formatTicket: jest.fn().mockResolvedValue('formatted receipt') };
    db.printerDevice.findFirst.mockResolvedValue({ id: 'primary-a' });
    db.printJob.upsert.mockResolvedValue({ id: 'main-job' });
    const order = { id: 'order-a' };

    const service = makeService(db, legacyPrinter);
    await service.createMainReceiptJobForOrder('tenant-a', 'order-a', order as never);
    await service.createMainReceiptJobForOrder('tenant-a', 'order-a', order as never);

    expect(legacyPrinter.formatTicket).toHaveBeenCalledWith(order, 'customer');
    expect(db.printJob.upsert).toHaveBeenCalledTimes(2);
    for (const call of db.printJob.upsert.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({
        where: { idempotencyKey: 'auto_print_order-a_customer_MAIN' },
        create: expect.objectContaining({ tenantId: 'tenant-a', orderId: 'order-a', station: 'MAIN' }),
      }));
    }
  });

  it('creates a repeatable test print while deduplicating the same request', async () => {
    const db = makeDb();
    db.order.findFirst.mockResolvedValue({ id: 'order-1' });
    db.printJob.upsert.mockImplementation(({ create }: { create: { idempotencyKey: string } }) =>
      Promise.resolve({ id: create.idempotencyKey }));
    const service = makeService(db);

    await service.createTestJob('tenant-a', 'MAIN', 'Printer');
    await service.createTestJob('tenant-a', 'MAIN', 'Printer');
    await service.createTestJob('tenant-a', 'MAIN', 'Printer', '11111111-1111-4111-8111-111111111111');
    await service.createTestJob('tenant-a', 'MAIN', 'Printer', '11111111-1111-4111-8111-111111111111');

    const keys = db.printJob.upsert.mock.calls.map((call) => call[0].create.idempotencyKey as string);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).toBe(keys[3]);
  });
});
