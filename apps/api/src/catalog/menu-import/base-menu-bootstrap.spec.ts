import { Prisma } from '@prisma/client';
import { seedBaseMenuTemplates } from './base-menu-bootstrap';
import type { MenuTemplate } from './menu-templates.data';

const template: MenuTemplate = {
  id: 'acai',
  name: 'Acai Oficial',
  description: 'Template oficial',
  businessSegment: 'acai',
  emoji: 'A',
  categories: [
    {
      name: 'Tamanhos',
      order: 1,
      products: [
        {
          name: 'Acai 300ml',
          shortDescription: 'Copo pequeno',
          basePrice: 15,
          searchTags: ['lookup:acai-300'],
          mediaLookupKey: 'lookup:acai-300',
        },
      ],
    },
  ],
};

describe('seedBaseMenuTemplates safe bootstrap', () => {
  const makePrisma = () => ({
    baseMenuTemplate: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    baseMenuTemplateVersion: {
      create: jest.fn(),
    },
    baseMenuCategory: {
      create: jest.fn(),
    },
    baseMenuProduct: {
      create: jest.fn(),
    },
  });

  it('creates official templates in an empty database', async () => {
    const prisma = makePrisma();
    prisma.baseMenuTemplate.findUnique.mockResolvedValue(null);
    prisma.baseMenuTemplate.create.mockResolvedValue({ id: 'template-1' });
    prisma.baseMenuTemplateVersion.create.mockResolvedValue({ id: 'version-1' });
    prisma.baseMenuCategory.create.mockResolvedValue({ id: 'category-1' });

    const summary = await seedBaseMenuTemplates(prisma as never, [template]);

    expect(summary.templatesCreated).toBe(1);
    expect(summary.versionsCreated).toBe(1);
    expect(summary.categories).toBe(1);
    expect(summary.products).toBe(1);
    expect(summary.templatesPreserved).toBe(0);
    expect(prisma.baseMenuTemplate.create).toHaveBeenCalled();
    expect(prisma.baseMenuTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ versionNumber: 1, status: 'published' }),
    }));
    expect(prisma.baseMenuTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: { currentPublishedVersionId: 'version-1' },
    });
  });

  it('preserves existing templates and never overwrites admin customizations', async () => {
    const prisma = makePrisma();
    prisma.baseMenuTemplate.findUnique.mockResolvedValue({
      id: 'template-1',
      name: 'Acai editado no admin',
      description: 'Template oficial',
      segment: 'acai',
      icon: 'A',
      currentPublishedVersionId: 'version-2',
      currentPublishedVersion: {
        id: 'version-2',
        categories: [
          {
            name: 'Tamanhos',
            products: [
              {
                name: 'Acai 300ml',
                description: 'Copo pequeno editado',
                basePrice: new Prisma.Decimal(18),
              },
            ],
          },
        ],
      },
    });

    const summary = await seedBaseMenuTemplates(prisma as never, [template]);

    expect(summary.templatesCreated).toBe(0);
    expect(summary.templatesPreserved).toBe(1);
    expect(summary.versionsOverwritten).toBe(0);
    expect(summary.productsOverwritten).toBe(0);
    expect(summary.warnings).toHaveLength(1);
    expect(prisma.baseMenuTemplate.create).not.toHaveBeenCalled();
    expect(prisma.baseMenuTemplateVersion.create).not.toHaveBeenCalled();
    expect(prisma.baseMenuCategory.create).not.toHaveBeenCalled();
    expect(prisma.baseMenuProduct.create).not.toHaveBeenCalled();
    expect(prisma.baseMenuTemplate.update).not.toHaveBeenCalled();
  });
});
