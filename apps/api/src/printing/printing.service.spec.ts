import { PrintJobStatus } from '@prisma/client';
import { PrintingService } from './printing.service';

describe('PrintingService print station bootstrap', () => {
  const makeDb = () => ({
    productCategory: {
      findMany: jest.fn(),
    },
    printJob: {
      groupBy: jest.fn(),
    },
    printStation: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
    },
  });

  const makeService = (db: ReturnType<typeof makeDb>) =>
    new PrintingService(db as never, {} as never);

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
    expect(db.printStation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_slug: { tenantId: 'tenant-1', slug: 'cozinha' } },
      create: expect.objectContaining({ tenantId: 'tenant-1', name: 'Cozinha', slug: 'cozinha' }),
      update: { isActive: true },
    }));
    expect(db.printStation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_slug: { tenantId: 'tenant-1', slug: 'bebidas' } },
      create: expect.objectContaining({ tenantId: 'tenant-1', name: 'Bebidas', slug: 'bebidas' }),
      update: { isActive: true },
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

    expect(db.printStation.upsert).toHaveBeenCalledTimes(1);
    expect(db.printStation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_slug: { tenantId: 'tenant-1', slug: 'general' } },
      create: expect.objectContaining({
        tenantId: 'tenant-1',
        slug: 'general',
        isActive: true,
        autoPrintEnabled: false,
      }),
      update: { isActive: true },
    }));
  });

  it('deduplicates repeated KDS stations through the tenant slug upsert key', async () => {
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

    expect(db.printStation.upsert).toHaveBeenCalledTimes(1);
    expect(db.printStation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_slug: { tenantId: 'tenant-1', slug: 'cozinha' } },
    }));
  });

  it('reuses an existing station by upserting and reactivating it', async () => {
    const db = makeDb();
    db.productCategory.findMany.mockResolvedValue([
      { templateConfig: { station: 'Area Fria' } },
    ]);
    db.printJob.groupBy.mockResolvedValue([]);
    db.printStation.findMany.mockResolvedValue([
      { id: 'station-existing', tenantId: 'tenant-1', name: 'Area Fria', slug: 'area-fria', isActive: true },
    ]);

    await makeService(db).ensurePrintStationsForTenant('tenant-1');

    expect(db.printStation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_slug: { tenantId: 'tenant-1', slug: 'area-fria' } },
      update: { isActive: true },
    }));
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
    for (const call of db.printStation.upsert.mock.calls) {
      expect(call[0].where.tenantId_slug.tenantId).toBe('tenant-a');
      expect(call[0].create.tenantId).toBe('tenant-a');
    }
  });
});
