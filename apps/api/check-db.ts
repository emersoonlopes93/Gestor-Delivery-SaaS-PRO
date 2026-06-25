import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const t = await prisma.tenant.findUnique({
    where: { slug: 'pizzaria-demo' },
    include: { subscription: { include: { plan: true } } }
  });
  console.log('--- SUBSCRIPTION ---');
  console.log(JSON.stringify(t?.subscription, null, 2));

  const mvpPlan = await prisma.billingPlan.findUnique({
    where: { slug: 'mvp-starter' },
    include: { modules: true }
  });
  console.log('--- MVP PLAN ---');
  console.log(JSON.stringify(mvpPlan, null, 2));

}
main().finally(() => prisma.$disconnect());
