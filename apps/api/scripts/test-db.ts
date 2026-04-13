import { PrismaClient } from '@prisma/client';
import { TenantStatus } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Testing prisma...');
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'test-slug' },
    update: {},
    create: { 
      name: 'Test', 
      slug: 'test-slug', 
      status: TenantStatus.active,
    }
  });
  console.log('Tenant:', tenant.id, tenant.name, tenant.slug);
}

main().catch(console.error).finally(() => prisma.$disconnect());
