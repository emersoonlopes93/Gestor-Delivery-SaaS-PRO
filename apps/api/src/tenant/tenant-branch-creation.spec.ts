/// <reference types="jest" />
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { TenantService } from './tenant.service';

jest.mock('./default-tenant-roles', () => ({
  ensureDefaultTenantRoles: jest.fn().mockResolvedValue(undefined),
}));

const currentTenant = {
  id: 'hq-1',
  name: 'Matriz',
  status: TenantStatus.active,
  businessGroupId: 'group-1',
  businessGroupRole: 'headquarters',
};

const owner = {
  id: 'owner-1',
  email: 'OWNER@EXAMPLE.COM',
  name: 'Owner',
  passwordHash: 'non-secret-test-hash',
};

const networkTenant = {
  id: 'hq-1',
  name: 'Matriz',
  slug: 'matriz',
  businessGroupId: 'group-1',
  businessGroupRole: 'headquarters',
  settings: { city: null, state: null },
};

function makePrisma() {
  const prisma = {
    tenantUser: {
      findFirst: jest.fn()
        .mockResolvedValueOnce({ id: 'owner-1' })
        .mockResolvedValueOnce(owner)
        .mockResolvedValueOnce(owner),
      create: jest.fn().mockResolvedValue({ id: 'branch-owner-1' }),
    },
    tenant: {
      findUnique: jest.fn()
        .mockResolvedValueOnce(currentTenant)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(networkTenant),
      create: jest.fn().mockResolvedValue({ id: 'branch-1' }),
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([
        { ...networkTenant, status: TenantStatus.active },
        {
          id: 'branch-1',
          name: 'Centro',
          slug: 'centro',
          status: TenantStatus.active,
          businessGroupRole: 'branch',
          settings: { city: null, state: null },
        },
      ]),
    },
    businessGroup: {
      create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        id: 'group-1',
        name: 'Matriz Rede',
        headquartersTenantId: 'hq-1',
      }),
    },
    tenantRole: {
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'owner-role-1' }),
    },
    tenantUserRole: {
      create: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
    },
    tenantPermission: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    tenantRolePermission: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (operation: (tx: typeof prisma) => Promise<unknown>) => operation(prisma));
  return prisma;
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new TenantService(
    prisma as never,
    { del: jest.fn() } as never,
  );
}

describe('TenantService.createBranch', () => {
  it('creates a separate tenant-scoped owner link in one serializable transaction', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const result = await service.createBranch('hq-1', 'owner-1', { name: ' Centro ' });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }));
    expect(prisma.tenant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        slug: 'centro',
        businessGroupId: 'group-1',
        businessGroupRole: 'branch',
      }),
    }));
    expect(prisma.tenantUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'branch-1',
        email: 'owner@example.com',
      }),
    });
    expect(prisma.tenantUserRole.create).toHaveBeenCalledTimes(1);
    expect(result.stores).toHaveLength(2);
  });

  it('creates and assigns the headquarters group inside the same transaction', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique
      .mockReset()
      .mockResolvedValueOnce({
        ...currentTenant,
        businessGroupId: null,
        businessGroupRole: null,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(networkTenant);
    prisma.businessGroup.create.mockResolvedValue({ id: 'new-group-1' });
    const service = makeService(prisma);

    await service.createBranch('hq-1', 'owner-1', { name: 'Centro' });

    expect(prisma.businessGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ headquartersTenantId: 'hq-1', ownerId: 'owner-1' }),
    });
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'hq-1' },
      data: { businessGroupId: 'new-group-1', businessGroupRole: 'headquarters' },
    });
    expect(prisma.tenant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessGroupId: 'new-group-1' }),
    }));
  });

  it('recovers the same completed logical attempt without creating another tenant or owner link', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique
      .mockReset()
      .mockResolvedValueOnce(currentTenant)
      .mockResolvedValueOnce({
        id: 'branch-1',
        name: 'Centro',
        businessGroupId: 'group-1',
        businessGroupRole: 'branch',
        users: [{ userRoles: [{ id: 'assignment-1' }] }],
      })
      .mockResolvedValueOnce(networkTenant);
    const service = makeService(prisma);

    await service.createBranch('hq-1', 'owner-1', { name: 'Centro', slug: 'centro' });

    expect(prisma.tenant.create).not.toHaveBeenCalled();
    expect(prisma.tenantUser.create).not.toHaveBeenCalled();
    expect(prisma.tenantUserRole.create).not.toHaveBeenCalled();
  });

  it('rejects a slug owned by another group without creating a cross-tenant link', async () => {
    const prisma = makePrisma();
    prisma.tenant.findUnique
      .mockReset()
      .mockResolvedValueOnce(currentTenant)
      .mockResolvedValueOnce({
        id: 'other-branch',
        name: 'Centro',
        businessGroupId: 'other-group',
        businessGroupRole: 'branch',
        users: [{ userRoles: [{ id: 'assignment-2' }] }],
      });
    const service = makeService(prisma);

    await expect(service.createBranch('hq-1', 'owner-1', { name: 'Centro' }))
      .rejects.toMatchObject({ status: 409 });
    expect(prisma.tenant.create).not.toHaveBeenCalled();
    expect(prisma.tenantUser.create).not.toHaveBeenCalled();
  });

  it('rejects a non-owner before any branch write', async () => {
    const prisma = makePrisma();
    prisma.tenantUser.findFirst.mockReset().mockResolvedValueOnce(null);
    const service = makeService(prisma);

    await expect(service.createBranch('hq-1', 'user-2', { name: 'Centro' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it('maps an incompatible tenant owner unique conflict to a stable 409 and does not continue roles', async () => {
    const prisma = makePrisma();
    prisma.tenantUser.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      'Unique constraint',
      { code: 'P2002', clientVersion: '5.20.0', meta: { target: ['tenant_id', 'email'] } },
    ));
    const service = makeService(prisma);

    const promise = service.createBranch('hq-1', 'owner-1', { name: 'Centro' });
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'BRANCH_OWNER_LINK_CONFLICT' }),
    });
    expect(prisma.tenantUserRole.create).not.toHaveBeenCalled();
  });

  it('does not expose a partial success when an intermediate transactional write fails', async () => {
    const prisma = makePrisma();
    prisma.tenantUserRole.create.mockRejectedValue(new Error('role assignment failed'));
    const service = makeService(prisma);

    await expect(service.createBranch('hq-1', 'owner-1', { name: 'Centro' }))
      .rejects.toThrow('role assignment failed');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
