import { CrmSegmentationService } from './crm-segmentation.service';

describe('CrmSegmentationService pagination safety', () => {
  const prisma = {
    customer: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
  const service = new CrmSegmentationService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.customer.count.mockResolvedValue(0);
    prisma.customer.findMany.mockResolvedValue([]);
  });

  it('normalizes non-finite and out-of-range pagination without dropping tenant scope', async () => {
    await expect(service.getSegmentedCustomers('tenant-1', Number.NaN, 0)).resolves.toEqual({
      data: [],
      meta: { total: 0, page: 1, limit: 1, totalPages: 0 },
    });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1' },
      skip: 0,
      take: 1,
    }));

    await service.getSegmentedCustomers('tenant-1', 2.8, 999);
    expect(prisma.customer.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1' },
      skip: 100,
      take: 100,
    }));
  });
});
