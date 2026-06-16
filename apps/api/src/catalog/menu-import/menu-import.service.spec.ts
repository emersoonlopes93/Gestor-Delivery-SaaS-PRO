import { Prisma } from '@prisma/client';
import { MenuImportService } from './menu-import.service';

describe('MenuImportService option groups import', () => {
  const makeService = () => {
    const prisma = {
      baseMenuTemplate: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      baseMenuImportLog: {
        create: jest.fn(),
      },
      mediaAsset: {
        findMany: jest.fn(),
      },
      mediaCategory: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      tenantClient: {
        productCategory: {
          findFirst: jest.fn(),
        },
        product: {
          findFirst: jest.fn(),
        },
        optionGroup: {
          findMany: jest.fn(),
          create: jest.fn(),
        },
        optionItem: {
          findMany: jest.fn(),
          create: jest.fn(),
        },
        productOptionGroupLink: {
          findUnique: jest.fn(),
          create: jest.fn(),
        },
      },
    };

    const tenantContext = { getTenantId: jest.fn().mockReturnValue('tenant-1') };
    const productsService = { create: jest.fn().mockResolvedValue({ id: 'product-1' }) };
    const categoriesService = { create: jest.fn().mockResolvedValue({ id: 'category-1', name: 'Acais' }) };
    const mediaLibrary = {};
    const service = new MenuImportService(
      prisma as never,
      tenantContext as never,
      productsService as never,
      categoriesService as never,
      mediaLibrary as never,
    );

    return { service, prisma, productsService, categoriesService };
  };

  it('creates real tenant option groups, items and product links from base product metadata', async () => {
    const { service, prisma } = makeService();
    prisma.baseMenuTemplate.findFirst.mockResolvedValue({
      id: 'template-db-1',
      slug: 'acai',
      name: 'Acai',
      description: 'Acai',
      segment: 'acai',
      icon: 'A',
      metadataJson: {},
      currentPublishedVersion: publishedVersion(),
      versions: [],
    });
    prisma.mediaAsset.findMany.mockResolvedValue([]);
    prisma.mediaCategory.findFirst.mockResolvedValue({ id: 'media-category' });
    prisma.tenantClient.productCategory.findFirst.mockResolvedValue(null);
    prisma.tenantClient.product.findFirst.mockResolvedValue(null);
    prisma.tenantClient.optionGroup.findMany.mockResolvedValue([]);
    prisma.tenantClient.optionGroup.create.mockResolvedValue({ id: 'group-1' });
    prisma.tenantClient.optionItem.findMany.mockResolvedValue([]);
    prisma.tenantClient.optionItem.create.mockResolvedValue({ id: 'item-1' });
    prisma.tenantClient.productOptionGroupLink.findUnique.mockResolvedValue(null);
    prisma.tenantClient.productOptionGroupLink.create.mockResolvedValue({ id: 'link-1' });

    const result = await service.importTemplate('acai');

    expect(result.success).toBe(true);
    expect(result.optionGroupsCreated).toBe(1);
    expect(result.optionItemsCreated).toBe(1);
    expect(result.productOptionLinksCreated).toBe(1);
    expect(prisma.tenantClient.optionGroup.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        name: 'Coberturas',
        selectionType: 'multiple',
      }),
    }));
    expect(prisma.tenantClient.optionItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        optionGroupId: 'group-1',
        priceImpactValue: new Prisma.Decimal(1.5),
      }),
    }));
    expect(prisma.baseMenuImportLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadataJson: expect.objectContaining({
          optionGroupsCreated: 1,
          optionItemsCreated: 1,
          productOptionLinksCreated: 1,
        }),
      }),
    }));
  });

  it('does not import options when skipExisting skips the product', async () => {
    const { service, prisma } = makeService();
    prisma.baseMenuTemplate.findFirst.mockResolvedValue({
      id: 'template-db-1',
      slug: 'acai',
      name: 'Acai',
      description: 'Acai',
      segment: 'acai',
      icon: 'A',
      metadataJson: {},
      currentPublishedVersion: publishedVersion(),
      versions: [],
    });
    prisma.mediaAsset.findMany.mockResolvedValue([]);
    prisma.mediaCategory.findFirst.mockResolvedValue({ id: 'media-category' });
    prisma.tenantClient.productCategory.findFirst.mockResolvedValue({ id: 'category-1', name: 'Acais' });
    prisma.tenantClient.product.findFirst.mockResolvedValue({ id: 'product-1' });

    const result = await service.importTemplate('acai', { skipExisting: true });

    expect(result.productsSkipped).toBe(1);
    expect(prisma.tenantClient.optionGroup.create).not.toHaveBeenCalled();
    expect(prisma.tenantClient.productOptionGroupLink.create).not.toHaveBeenCalled();
  });
});

function publishedVersion() {
  return {
    id: 'version-1',
    status: 'published',
    versionNumber: 1,
    categories: [
      {
        name: 'Acais',
        sortOrder: 1,
        products: [
          {
            name: 'Acai 300ml',
            description: 'Copo pequeno',
            basePrice: new Prisma.Decimal(16.9),
            searchTagsJson: [],
            mediaLookupKey: null,
            sortOrder: 1,
            metadataJson: {
              optionGroups: [
                {
                  slug: 'coberturas',
                  name: 'Coberturas',
                  selectionType: 'multiple',
                  maxSelect: 5,
                  items: [
                    {
                      slug: 'granola',
                      name: 'Granola',
                      priceImpactType: 'fixed',
                      priceImpactValue: 1.5,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
