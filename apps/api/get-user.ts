import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.tenantUser.findFirst({
    where: {
      tenant: { status: 'active' },
    },
    include: {
      tenant: true,
    },
  });
  console.log(JSON.stringify(user, null, 2));
}

main().finally(() => prisma.$disconnect());
