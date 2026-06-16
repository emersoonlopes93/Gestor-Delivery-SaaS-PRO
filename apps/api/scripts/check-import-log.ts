import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'tenant-teste-base-menu' } });
  if (!tenant) throw new Error('Tenant not found');

  const logs = await prisma.baseMenuImportLog.findMany({
    where: { tenantId: tenant.id }
  });

  console.log(`Found ${logs.length} logs:`);
  console.log(JSON.stringify(logs, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
