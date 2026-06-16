import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminBaseMenuService } from './admin-base-menu.service';

const actor = { id: 'admin-1', ip: '127.0.0.1' };
const publishedProduct = {
  id: 'product-v1',
  categoryId: 'category-v1',
  slug: 'acai-300ml',
  name: 'Acai 300ml',
  description: 'Original',
  basePrice: new Prisma.Decimal(15),
  compareAtPrice: null,
  sortOrder: 1,
  mediaLookupKey: 'lookup:acai-300',
  searchTagsJson: ['lookup:acai-300'],
  metadataJson: { mediaCategory: 'acai' },
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
};
const publishedCategory = {
  id: 'category-v1',
  versionId: 'version-1',
  slug: 'tamanhos',
  name: 'Tamanhos',
  description: null,
  sortOrder: 1,
  metadataJson: null,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  products: [publishedProduct],
};
const publishedVersion = {
  id: 'version-1',
  templateId: 'template-1',
  versionNumber: 1,
  status: 'published',
  publishedAt: new Date('2026-06-01T00:00:00.000Z'),
  metadataJson: null,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  categories: [publishedCategory],
};
const draftVersion = {
  id: 'version-2',
  templateId: 'template-1',
  versionNumber: 2,
  status: 'draft',
  publishedAt: null,
  metadataJson: null,
  createdAt: new Date('2026-06-02T00:00:00.000Z'),
  updatedAt: new Date('2026-06-02T00:00:00.000Z'),
  categories: [
    {
      ...publishedCategory,
      id: 'category-v2',
      versionId: 'version-2',
      products: [
        {
          ...publishedProduct,
          id: 'product-v2',
          categoryId: 'category-v2',
        },
      ],
    },
  ],
};
const template = {
  id: 'template-1',
  slug: 'acai',
  name: 'Acai',
  description: 'Template',
  segment: 'acai',
  icon: 'A',
  status: 'published',
  currentPublishedVersionId: 'version-1',
  metadataJson: null,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
};

describe('AdminBaseMenuService draft/published flow', () => {
  const makePrisma = () => {
    const prisma = {
      baseMenuTemplate: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      baseMenuTemplateVersion: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      baseMenuCategory: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      baseMenuProduct: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      mediaAsset: {
        findMany: jest.fn(),
      },
      tenant: {
        upsert: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
    prisma.tenant.upsert.mockResolvedValue({ id: 'platform-audit' });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    prisma.mediaAsset.findMany.mockResolvedValue([]);
    return prisma;
  };

  it('creates a draft from published without moving currentPublishedVersionId', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst
      .mockResolvedValueOnce({
        ...template,
        currentPublishedVersion: publishedVersion,
        versions: [publishedVersion],
      })
      .mockResolvedValueOnce(template);
    prisma.baseMenuTemplateVersion.create.mockResolvedValue({ ...draftVersion, categories: undefined });
    prisma.baseMenuCategory.create.mockResolvedValue({ ...publishedCategory, id: 'category-v2' });
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValue(draftVersion);

    await service.createDraftVersion('acai', actor);

    expect(prisma.baseMenuTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ templateId: 'template-1', versionNumber: 2, status: 'draft' }),
    }));
    expect(prisma.baseMenuProduct.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Acai 300ml', categoryId: 'category-v2' }),
    }));
    expect(prisma.baseMenuTemplate.update).not.toHaveBeenCalled();
  });

  it('returns an existing draft instead of creating another one', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst
      .mockResolvedValueOnce({
        ...template,
        currentPublishedVersion: publishedVersion,
        versions: [draftVersion, publishedVersion],
      })
      .mockResolvedValueOnce(template);
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValue(draftVersion);

    const result = await service.createDraftVersion('acai', actor);

    expect(result.version.id).toBe('version-2');
    expect(prisma.baseMenuTemplateVersion.create).not.toHaveBeenCalled();
  });

  it('updates only a product in draft', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst.mockResolvedValue(template);
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValue({ ...draftVersion, categories: undefined });
    prisma.baseMenuProduct.findFirst.mockResolvedValue(draftVersion.categories[0].products[0]);
    prisma.baseMenuProduct.update.mockImplementation(({ data }) => Promise.resolve({
      ...draftVersion.categories[0].products[0],
      ...data,
    }));

    await service.updateProduct('acai', 'version-2', 'product-v2', { name: 'Acai 300ml Especial', basePrice: 19 }, actor);

    expect(prisma.baseMenuProduct.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'product-v2' },
      data: expect.objectContaining({ name: 'Acai 300ml Especial' }),
    }));
    expect(prisma.baseMenuTemplate.update).not.toHaveBeenCalled();
  });

  it('blocks product updates on published versions', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst.mockResolvedValue(template);
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValue({ ...publishedVersion, categories: undefined });

    await expect(service.updateProduct('acai', 'version-1', 'product-v1', { name: 'Nao pode' }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.baseMenuProduct.update).not.toHaveBeenCalled();
  });

  it('publishes draft, archives previous published version and updates currentPublishedVersionId', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst.mockResolvedValue(template);
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValue(draftVersion);
    prisma.baseMenuTemplateVersion.update.mockResolvedValue({ ...draftVersion, status: 'published', publishedAt: new Date('2026-06-03T00:00:00.000Z') });

    await service.publishDraft('acai', actor);

    expect(prisma.baseMenuTemplateVersion.updateMany).toHaveBeenCalledWith({
      where: { templateId: 'template-1', status: 'published', id: { not: 'version-2' } },
      data: { status: 'archived' },
    });
    expect(prisma.baseMenuTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: { status: 'published', currentPublishedVersionId: 'version-2' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('does not publish draft with blocking validation errors', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst.mockResolvedValue(template);
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValue({
      ...draftVersion,
      categories: [],
    });

    await expect(service.publishDraft('acai', actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.baseMenuTemplateVersion.updateMany).not.toHaveBeenCalled();
    expect(prisma.baseMenuTemplate.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'base_menu.draft.publish_blocked' }),
    }));
  });

  it('publishes draft with warnings and stores warnings in audit metadata', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst.mockResolvedValue(template);
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValue({
      ...draftVersion,
      categories: [
        {
          ...draftVersion.categories[0],
          products: [
            {
              ...draftVersion.categories[0].products[0],
              description: '',
              mediaLookupKey: null,
              searchTagsJson: [],
            },
          ],
        },
      ],
    });
    prisma.baseMenuTemplateVersion.update.mockResolvedValue({ ...draftVersion, status: 'published', publishedAt: new Date('2026-06-03T00:00:00.000Z') });

    const result = await service.publishDraft('acai', actor);

    expect(result.validation.errors).toHaveLength(0);
    expect(result.validation.warnings.length).toBeGreaterThan(0);
    expect(prisma.baseMenuTemplate.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentPublishedVersionId: 'version-2' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'base_menu.draft.publish',
        details: expect.objectContaining({
          validation: expect.objectContaining({
            warnings: expect.arrayContaining([expect.stringContaining('sem descricao')]),
          }),
        }),
      }),
    }));
  });

  it('discards draft without changing the current published version', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst.mockResolvedValue(template);
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValue(draftVersion);
    prisma.baseMenuTemplateVersion.update.mockResolvedValue({ ...draftVersion, status: 'archived' });

    const result = await service.discardDraft('acai', actor);

    expect(result.currentPublishedVersionId).toBe('version-1');
    expect(prisma.baseMenuTemplateVersion.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'version-2' },
      data: expect.objectContaining({ status: 'archived' }),
    }));
    expect(prisma.baseMenuTemplate.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'base_menu.draft.discard' }),
    }));
  });
  it('creates a new template as draft', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst.mockImplementation(async ({ where }) => {
      if (where?.slug === 'novo-menu') return null;
      if (where?.OR?.[0]?.id === 'new-template' || where?.OR?.[1]?.slug === 'new-template') return { ...template, id: 'new-template', status: 'draft' };
      return template;
    });
    prisma.baseMenuTemplate.create.mockResolvedValue({ ...template, id: 'new-template', status: 'draft' });
    prisma.baseMenuTemplateVersion.create.mockResolvedValue({ ...draftVersion, templateId: 'new-template' });
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValue({ ...draftVersion, templateId: 'new-template' });

    await service.createTemplate({ name: 'Novo Menu', slug: 'novo-menu' }, actor);

    expect(prisma.baseMenuTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Novo Menu', slug: 'novo-menu', status: 'draft' }),
    }));
    expect(prisma.baseMenuTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ templateId: 'new-template', versionNumber: 1, status: 'draft' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'base_menu.template.create' }),
    }));
  });

  it('duplicates an existing template and its products to a new draft template', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    
    // source template
    prisma.baseMenuTemplate.findFirst.mockImplementation(async ({ where }) => {
      if (where?.slug === 'acai-copia') return null;
      if (where?.OR?.[0]?.id === 'new-dup-template' || where?.OR?.[1]?.slug === 'new-dup-template') return { ...template, id: 'new-dup-template', status: 'draft' };
      if (where?.OR?.[0]?.id === 'acai' || where?.OR?.[1]?.slug === 'acai') return { ...template, id: 'source-template', currentPublishedVersionId: 'version-1' };
      return template;
    });
      
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValueOnce({ 
      ...publishedVersion, 
      templateId: 'source-template',
      categories: [publishedCategory]
    });
    
    prisma.baseMenuTemplate.create.mockResolvedValue({ ...template, id: 'new-dup-template', status: 'draft' });
    prisma.baseMenuTemplateVersion.create.mockResolvedValue({ ...draftVersion, id: 'new-dup-version', templateId: 'new-dup-template' });
    prisma.baseMenuCategory.create.mockResolvedValue({ ...publishedCategory, id: 'new-dup-category' });
    prisma.baseMenuTemplateVersion.findFirst.mockResolvedValueOnce({ ...draftVersion, templateId: 'new-dup-template' }); // for getDraft

    await service.duplicateTemplate('acai', { name: 'Acai Copia', slug: 'acai-copia' }, actor);

    expect(prisma.baseMenuTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Acai Copia', slug: 'acai-copia', status: 'draft' }),
    }));
    expect(prisma.baseMenuProduct.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ categoryId: 'new-dup-category', slug: 'acai-300ml' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'base_menu.template.duplicate' }),
    }));
  });

  it('archives a template', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst.mockResolvedValue(template);
    prisma.baseMenuTemplate.update.mockResolvedValue({ ...template, status: 'archived' });

    await service.archiveTemplate('acai', actor);

    expect(prisma.baseMenuTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: { status: 'archived' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'base_menu.template.archive' }),
    }));
  });

  it('restores an archived template back to its correct status', async () => {
    const prisma = makePrisma();
    const service = new AdminBaseMenuService(prisma as never);
    prisma.baseMenuTemplate.findFirst.mockResolvedValue({ ...template, status: 'archived' });
    prisma.baseMenuTemplate.update.mockResolvedValue({ ...template, status: 'published' });

    await service.restoreTemplate('acai', actor);

    expect(prisma.baseMenuTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: { status: 'published' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'base_menu.template.restore' }),
    }));
  });
});
