import { TenantDefaultRole } from '@gestor/core';
import {
  ensureDefaultTenantRoles,
  getTenantRolePolicy,
} from './default-tenant-roles';

describe('default tenant roles', () => {
  it('marks owner as protected and requiring strong confirmation', () => {
    expect(getTenantRolePolicy(TenantDefaultRole.TENANT_OWNER)).toMatchObject({
      name: 'Dono',
      protected: true,
      assignable: true,
      requiresStrongConfirmation: true,
    });
  });

  it('creates the default tenant role catalog idempotently', async () => {
    const upsertRole = jest.fn().mockImplementation(({ where, create }) =>
      Promise.resolve({
        id: `role-${where.tenantId_slug.slug}`,
        tenantId: where.tenantId_slug.tenantId,
        slug: where.tenantId_slug.slug,
        ...create,
      }),
    );
    const upsertPermission = jest.fn().mockResolvedValue(undefined);
    const createManyRolePermissions = jest.fn().mockResolvedValue({ count: 1 });

    const prisma = {
      tenantPermission: {
        upsert: upsertPermission,
        findMany: jest.fn().mockResolvedValue([
          { id: 'perm-orders-read', slug: 'orders.read' },
          { id: 'perm-users-read', slug: 'users.read' },
          { id: 'perm-dashboard-view', slug: 'dashboard.view' },
          { id: 'perm-billing-read', slug: 'billing.read' },
          { id: 'perm-kds-use', slug: 'kds.use' },
        ]),
      },
      tenantRole: {
        upsert: upsertRole,
      },
      tenantRolePermission: {
        createMany: createManyRolePermissions,
      },
    };

    await ensureDefaultTenantRoles(prisma as never, 'tenant-1');

    expect(upsertPermission).toHaveBeenCalled();
    expect(upsertRole).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_slug: {
            tenantId: 'tenant-1',
            slug: TenantDefaultRole.TENANT_OWNER,
          },
        },
      }),
    );
    expect(createManyRolePermissions).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
    }));
  });
});
