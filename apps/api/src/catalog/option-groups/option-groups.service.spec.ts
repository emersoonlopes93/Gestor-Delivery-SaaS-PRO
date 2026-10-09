import { OptionGroupsService } from './option-groups.service';

describe('OptionGroupsService archive lifecycle', () => {
  const tenantId = 'tenant-a';
  const actorId = 'user-a';
  const activeGroup = { id: 'group-a', deletedAt: null, items: [], productLinks: [], _count: { productLinks: 0 } };

  function makeService() {
    const prisma = {
      tenantClient: {
        optionGroup: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
          update: jest.fn(),
        },
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ slug: 'tenant-store' }),
      },
      auditLog: { create: jest.fn() },
    };
    const cacheManager = { del: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { getTenantId: jest.fn().mockReturnValue(tenantId) };
    const service = Reflect.construct(OptionGroupsService, [prisma, tenantContext, cacheManager]) as OptionGroupsService;
    return { prisma, service, cacheManager };
  }

  it('archives a group without removing its links and writes a tenant audit record', async () => {
    const { prisma, service, cacheManager } = makeService();
    prisma.tenantClient.optionGroup.findFirst.mockResolvedValue(activeGroup);
    prisma.tenantClient.optionGroup.update.mockResolvedValue({ ...activeGroup, deletedAt: new Date() });

    await service.archiveGroup(activeGroup.id, actorId);

    expect(prisma.tenantClient.optionGroup.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: activeGroup.id, deletedAt: null } }));
    expect(prisma.tenantClient.optionGroup.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: activeGroup.id }, data: { deletedAt: expect.any(Date) } }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenantId, userId: actorId, action: 'catalog.option_group.archived', resource: 'option_group' }) }));
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { id: tenantId }, select: { slug: true } });
    expect(cacheManager.del).toHaveBeenCalledWith('storefront:tenant-store:delivery');
    expect(cacheManager.del).toHaveBeenCalledWith('storefront:tenant-store:pickup');
  });

  it('lists only active groups unless the archived library is requested', async () => {
    const { prisma, service } = makeService();
    prisma.tenantClient.optionGroup.findMany.mockResolvedValue([]);

    await service.listGroups();
    await service.listGroups(true);

    expect(prisma.tenantClient.optionGroup.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { deletedAt: null } }));
    expect(prisma.tenantClient.optionGroup.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: undefined }));
  });

  it('returns the optionGroupLinks usage count consumed by the tenant library', async () => {
    const { prisma, service } = makeService();
    prisma.tenantClient.optionGroup.findMany.mockResolvedValue([{
      ...activeGroup,
      _count: { productLinks: 2 },
      items: [{ id: 'active-item', deletedAt: null }, { id: 'archived-item', deletedAt: new Date() }],
    }]);

    const groups = await service.listGroups(true);

    expect(groups[0]).toMatchObject({
      _count: { optionGroupLinks: 2 },
      items: [{ id: 'active-item' }, { id: 'archived-item' }],
    });
  });
});
