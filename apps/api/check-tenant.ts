import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const settings = await prisma.tenantSettings.findFirst({
    where: { tenant: { slug: 'pizzaria-demo' } }
  });
  console.log('PAYMENT METHODS:', settings?.paymentMethods);
  await prisma.$disconnect();
}

main();
