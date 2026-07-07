import { Prisma, PrismaClient } from '@prisma/client';
import {
  TENANT_PERMISSIONS,
  TENANT_ROLE_PERMISSIONS,
  TenantDefaultRole,
  type TenantPermission,
} from '@gestor/core';

type PrismaRoleClient = Pick<
  PrismaClient | Prisma.TransactionClient,
  'tenantPermission' | 'tenantRole' | 'tenantRolePermission'
>;

export interface TenantRolePolicy {
  slug: string;
  name: string;
  description: string;
  protected: boolean;
  assignable: boolean;
  requiresStrongConfirmation: boolean;
  suggestedForNewUsers: boolean;
}

const DEFAULT_TENANT_ROLE_POLICIES: Record<string, TenantRolePolicy> = {
  [TenantDefaultRole.TENANT_OWNER]: {
    slug: TenantDefaultRole.TENANT_OWNER,
    name: 'Dono',
    description: 'Acesso total ao tenant, incluindo configuracoes criticas, usuarios e billing.',
    protected: true,
    assignable: true,
    requiresStrongConfirmation: true,
    suggestedForNewUsers: false,
  },
  [TenantDefaultRole.TENANT_ADMIN]: {
    slug: TenantDefaultRole.TENANT_ADMIN,
    name: 'Administrador Interno',
    description: 'Cargo tecnico com acesso amplo. Mantido para compatibilidade e nao exposto para atribuicao comum.',
    protected: true,
    assignable: false,
    requiresStrongConfirmation: true,
    suggestedForNewUsers: false,
  },
  [TenantDefaultRole.MANAGER]: {
    slug: TenantDefaultRole.MANAGER,
    name: 'Gerente',
    description: 'Administra a operacao do dia a dia sem transferir propriedade nem gerenciar billing critico.',
    protected: false,
    assignable: true,
    requiresStrongConfirmation: false,
    suggestedForNewUsers: false,
  },
  [TenantDefaultRole.ATTENDANT]: {
    slug: TenantDefaultRole.ATTENDANT,
    name: 'Atendente',
    description: 'Opera pedidos, clientes basicos e atendimento sem acesso a configuracoes criticas.',
    protected: false,
    assignable: true,
    requiresStrongConfirmation: false,
    suggestedForNewUsers: true,
  },
  [TenantDefaultRole.CASHIER]: {
    slug: TenantDefaultRole.CASHIER,
    name: 'Operador de Caixa',
    description: 'Opera caixa e vendas no POS sem acesso administrativo amplo.',
    protected: false,
    assignable: true,
    requiresStrongConfirmation: false,
    suggestedForNewUsers: false,
  },
  [TenantDefaultRole.KITCHEN]: {
    slug: TenantDefaultRole.KITCHEN,
    name: 'Cozinha',
    description: 'Visualiza o KDS e atualiza o preparo sem acesso financeiro ou de configuracao.',
    protected: false,
    assignable: true,
    requiresStrongConfirmation: false,
    suggestedForNewUsers: false,
  },
  [TenantDefaultRole.DISPATCHER]: {
    slug: TenantDefaultRole.DISPATCHER,
    name: 'Despacho',
    description: 'Acompanha pedidos e despacha entregas sem acesso administrativo.',
    protected: false,
    assignable: true,
    requiresStrongConfirmation: false,
    suggestedForNewUsers: false,
  },
  [TenantDefaultRole.DELIVERY_OPERATOR]: {
    slug: TenantDefaultRole.DELIVERY_OPERATOR,
    name: 'Entregador',
    description: 'Acompanha entregas atribuidas sem acesso a catalogo, financeiro ou configuracoes.',
    protected: false,
    assignable: true,
    requiresStrongConfirmation: false,
    suggestedForNewUsers: false,
  },
  [TenantDefaultRole.FINANCE]: {
    slug: TenantDefaultRole.FINANCE,
    name: 'Financeiro',
    description: 'Consulta financeiro e relatorios sem alterar usuarios nem configuracoes criticas.',
    protected: false,
    assignable: true,
    requiresStrongConfirmation: false,
    suggestedForNewUsers: false,
  },
  [TenantDefaultRole.MARKETING]: {
    slug: TenantDefaultRole.MARKETING,
    name: 'Marketing',
    description: 'Opera CRM, campanhas e promocoes sem acesso administrativo critico.',
    protected: false,
    assignable: true,
    requiresStrongConfirmation: false,
    suggestedForNewUsers: false,
  },
  [TenantDefaultRole.WAITER]: {
    slug: TenantDefaultRole.WAITER,
    name: 'Garcom',
    description: 'Opera mesas e comandas quando o modulo POS estiver ativo.',
    protected: false,
    assignable: true,
    requiresStrongConfirmation: false,
    suggestedForNewUsers: false,
  },
};

export function getTenantRolePolicy(slug: string): TenantRolePolicy {
  return (
    DEFAULT_TENANT_ROLE_POLICIES[slug] ?? {
      slug,
      name: slug,
      description: 'Cargo personalizado do tenant.',
      protected: false,
      assignable: true,
      requiresStrongConfirmation: false,
      suggestedForNewUsers: false,
    }
  );
}

function buildPermissionDescription(slug: string, fallback: string): string {
  const [module, action] = slug.split('.');
  return fallback ?? `${module}.${action}`;
}

export async function ensureTenantPermissionCatalog(client: PrismaRoleClient) {
  const permissionEntries = Object.entries(TENANT_PERMISSIONS) as [TenantPermission, string][];

  for (const [slug, description] of permissionEntries) {
    const [module, action] = slug.split('.');
    await client.tenantPermission.upsert({
      where: { slug },
      update: { description },
      create: {
        module,
        action,
        slug,
        description: buildPermissionDescription(slug, description),
      },
    });
  }
}

export async function ensureDefaultTenantRoles(
  client: PrismaRoleClient,
  tenantId: string,
) {
  await ensureTenantPermissionCatalog(client);

  const permissions = await client.tenantPermission.findMany({
    where: {
      slug: {
        in: Array.from(
          new Set(
            Object.values(TENANT_ROLE_PERMISSIONS).flatMap((items) => items),
          ),
        ),
      },
    },
    select: { id: true, slug: true },
  });

  const permissionBySlug = new Map(permissions.map((permission) => [permission.slug, permission.id]));

  for (const roleSlug of Object.values(TenantDefaultRole)) {
    const policy = getTenantRolePolicy(roleSlug);
    const role = await client.tenantRole.upsert({
      where: { tenantId_slug: { tenantId, slug: roleSlug } },
      update: {
        name: policy.name,
        description: policy.description,
        isSystem: true,
      },
      create: {
        tenantId,
        slug: roleSlug,
        name: policy.name,
        description: policy.description,
        isSystem: true,
      },
    });

    const permissionIds = (TENANT_ROLE_PERMISSIONS[roleSlug] ?? [])
      .map((permissionSlug) => permissionBySlug.get(permissionSlug))
      .filter((permissionId): permissionId is string => typeof permissionId === 'string');

    for (const permissionId of permissionIds) {
      await client.tenantRolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId,
        },
      });
    }
  }
}
