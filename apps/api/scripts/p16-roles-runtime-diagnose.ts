import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'pizzaria-demo' },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
    },
  });

  if (!tenant) {
    console.log(JSON.stringify({ tenant: null }, null, 2));
    return;
  }

  const [users, roles, recentAuditLogs] = await Promise.all([
    prisma.tenantUser.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        userRoles: {
          select: {
            role: {
              select: {
                slug: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.tenantRole.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        isSystem: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: tenant.id },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        userType: true,
        action: true,
        resource: true,
        details: true,
        createdAt: true,
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        tenant,
        users,
        roles,
        recentAuditLogs,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
