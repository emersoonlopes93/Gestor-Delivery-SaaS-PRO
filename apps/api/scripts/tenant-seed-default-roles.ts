import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { ensureDefaultTenantRoles } from '../src/tenant/default-tenant-roles';

async function main() {
  const prisma = new PrismaClient();

  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const tenant of tenants) {
      await ensureDefaultTenantRoles(prisma, tenant.id);
      console.log(`seeded default tenant roles: ${tenant.slug} (${tenant.name})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('failed to seed default tenant roles', error);
  process.exit(1);
});
