import { Prisma } from '@prisma/client';
import { MenuImportService } from './menu-import.service';

describe('MenuImportService durable transactional import', () => {
  const makeService = () => {
    const prisma = {
      baseMenuTemplate: { findFirst: jest.fn() },
      baseMenuImportLog: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      productCategory: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'category-1', name: 'Acais' }),
      },
      product: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'product-1' }),
      },
      catalogPublication: { create: jest.fn() },
      mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
      optionGroup: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      optionItem: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      productOptionGroupLink: { create: jest.fn() },
      productOptionItemPrice: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (operation: (tx: typeof prisma) => Promise<unknown>) => operation(prisma));
    prisma.baseMenuTemplate.findFirst.mockResolvedValue(publishedTemplate());
    prisma.baseMenuImportLog.findUnique.mockResolvedValue(null);

    const productsService = { invalidateStorefrontCacheForTenant: jest.fn() };
    const service = new MenuImportService(
      prisma as never,
      { getTenantId: jest.fn().mockReturnValue('tenant-1') } as never,
      productsService as never,
    );
    return { service, prisma, productsService };
  };

  it('claims tenant plus template version and commits one all-or-nothing result', async () => {
    const { service, prisma, productsService } = makeService();

    const result = await service.importTemplate('acai');

    expect(result).toEqual(expect.objectContaining({ success: true, categoriesCreated: 1, productsCreated: 1 }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }));
    expect(prisma.baseMenuImportLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operationKey: 'tenant-1:version-1', status: 'failed' }),
    });
    expect(prisma.baseMenuImportLog.update).toHaveBeenCalledWith({
      where: { operationKey: 'tenant-1:version-1' },
      data: expect.objectContaining({ status: 'success', categoriesCreated: 1, productsCreated: 1 }),
    });
    expect(productsService.invalidateStorefrontCacheForTenant).toHaveBeenCalledWith('tenant-1');
  });

  it('returns the canonical completed operation without any new writes', async () => {
    const { service, prisma } = makeService();
    prisma.baseMenuImportLog.findUnique.mockResolvedValue(completedLog());

    const result = await service.importTemplate('acai');

    expect(result).toEqual(expect.objectContaining({ success: true, categoriesCreated: 1, productsCreated: 1 }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects a non-empty catalog before creating catalog items', async () => {
    const { service, prisma } = makeService();
    prisma.product.count.mockResolvedValue(1);

    await expect(service.importTemplate('acai')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BASE_MENU_IMPORT_REQUIRES_EMPTY_CATALOG' }),
    });
    expect(prisma.productCategory.create).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.baseMenuImportLog.update).not.toHaveBeenCalled();
  });

  it('propagates an item failure so the enclosing transaction can roll back every write', async () => {
    const { service, prisma } = makeService();
    prisma.product.create.mockRejectedValue(new Error('synthetic product failure'));

    await expect(service.importTemplate('acai')).rejects.toThrow('synthetic product failure');
    expect(prisma.baseMenuImportLog.update).not.toHaveBeenCalled();
  });

  it('recovers only the equivalent operationKey P2002 as the canonical result', async () => {
    const { service, prisma } = makeService();
    prisma.baseMenuImportLog.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completedLog());
    prisma.$transaction.mockRejectedValue(operationKeyConflict());

    const result = await service.importTemplate('acai');

    expect(result).toEqual(expect.objectContaining({ success: true, productsCreated: 1 }));
  });

  it('does not swallow a different P2002 constraint', async () => {
    const { service, prisma } = makeService();
    const conflict = new Prisma.PrismaClientKnownRequestError('different unique conflict', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['tenant_id', 'slug'] },
    });
    prisma.$transaction.mockRejectedValue(conflict);

    await expect(service.importTemplate('acai')).rejects.toBe(conflict);
  });
});

function operationKeyConflict() {
  return new Prisma.PrismaClientKnownRequestError('operation key conflict', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: ['operation_key'] },
  });
}

function completedLog() {
  return {
    status: 'success',
    categoriesCreated: 1,
    productsCreated: 1,
    categoriesSkipped: 0,
    productsSkipped: 0,
    metadataJson: {
      result: {
        categoriesCreated: 1,
        productsCreated: 1,
        imagesLinked: 0,
        durationMs: 10,
      },
    },
  };
}

function publishedTemplate() {
  return {
    id: 'template-db-1',
    slug: 'acai',
    name: 'Acai',
    description: 'Acai',
    segment: 'acai',
    icon: 'A',
    metadataJson: {},
    currentPublishedVersion: {
      id: 'version-1',
      status: 'published',
      versionNumber: 1,
      categories: [{
        name: 'Acais',
        sortOrder: 1,
        metadataJson: {},
        products: [{
          name: 'Acai 300ml',
          description: 'Copo pequeno',
          basePrice: new Prisma.Decimal(16.9),
          searchTagsJson: [],
          mediaLookupKey: null,
          sortOrder: 1,
          metadataJson: {},
        }],
      }],
    },
    versions: [],
  };
}
