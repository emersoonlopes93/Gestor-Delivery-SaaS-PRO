import { NotFoundException } from '@nestjs/common';
import { KdsService } from './kds.service';

describe('KdsService getPrintJob', () => {
  const makeDb = () => ({
    order: {
      findFirst: jest.fn(),
    },
    printJob: {
      findFirst: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  });

  const makeService = (db: ReturnType<typeof makeDb>, tenantId = 'tenant-a') =>
    new KdsService(
      db as never,
      { getTenantId: () => tenantId } as never,
      {} as never,
    );

  it('returns a job only from the active tenant', async () => {
    const db = makeDb();
    const printJob = { id: 'job-1', tenantId: 'tenant-a', order: { items: [], customer: null } };
    db.printJob.findFirst.mockResolvedValue(printJob);

    await expect(makeService(db).getPrintJob('job-1')).resolves.toBe(printJob);
    expect(db.printJob.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', tenantId: 'tenant-a' },
      include: { order: { include: { items: true, customer: true } } },
    });
  });

  it('does not disclose a job that is not visible to the active tenant', async () => {
    const db = makeDb();
    db.printJob.findFirst.mockResolvedValue(null);

    await expect(makeService(db).getPrintJob('job-from-other-tenant')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates a print job only after validating the order tenant', async () => {
    const db = makeDb();
    db.order.findFirst.mockResolvedValue({ id: 'order-1' });
    db.printJob.create.mockResolvedValue({ id: 'job-1' });

    await makeService(db).createPrintJob({ orderId: 'order-1', station: 'GERAL', content: 'ticket' });

    expect(db.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'order-1', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(db.printJob.create).toHaveBeenCalled();
  });

  it('does not create a print job for an order from another tenant', async () => {
    const db = makeDb();
    db.order.findFirst.mockResolvedValue(null);

    await expect(
      makeService(db).createPrintJob({ orderId: 'foreign-order', station: 'GERAL', content: 'ticket' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.printJob.create).not.toHaveBeenCalled();
  });

  it('does not create an incremental job for an order from another tenant', async () => {
    const db = makeDb();
    db.order.findFirst.mockResolvedValue(null);

    await expect(
      makeService(db).createIncrementalPrintJob({ orderId: 'foreign-order', station: 'GERAL', content: 'ticket' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.printJob.upsert).not.toHaveBeenCalled();
  });

  it('does not create batch jobs for an order from another tenant', async () => {
    const db = makeDb();
    db.order.findFirst.mockResolvedValue(null);

    await expect(
      makeService(db).createIncrementalPrintJobsForOrder({
        orderId: 'foreign-order',
        station: 'GERAL',
        items: [{ content: 'ticket' }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.printJob.upsert).not.toHaveBeenCalled();
  });

  it('cleans up old jobs only from the requested tenant', async () => {
    const db = makeDb();
    db.printJob.deleteMany.mockResolvedValue({ count: 1 });

    await makeService(db).cleanupOldJobs('tenant-a', 7);

    expect(db.printJob.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        createdAt: { lt: expect.any(Date) },
        status: { in: expect.any(Array) },
      },
    });
  });
});
