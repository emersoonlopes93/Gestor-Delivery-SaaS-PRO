import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const existing = await prisma.tenant.findUnique({ where: { slug: 'tenant-teste-base-menu' } });
  if (existing) {
    console.log(`Tenant exists: ${existing.id}`);
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Tenant Teste Base Menu',
      slug: 'tenant-teste-base-menu',
      status: 'active',
    }
  });

  console.log(`Tenant created: ${tenant.id}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
