import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.tenantUser.findMany({
    take: 1,
    include: { tenant: true }
  });
  
  if (users.length > 0) {
    const u = users[0];
    console.log(`Email: ${u.email}`);
    console.log(`Tenant Slug: ${u.tenant.slug}`);
    console.log(`Tenant ID: ${u.tenant.id}`);
  } else {
    console.log('Nenhum TenantUser encontrado.');
  }

  await prisma.$disconnect();
}

main();
