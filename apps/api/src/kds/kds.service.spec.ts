import { NotFoundException } from '@nestjs/common';
import { KdsService } from './kds.service';

describe('KdsService getPrintJob', () => {
  const makeDb = () => ({
    printJob: {
      findFirst: jest.fn(),
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
});
