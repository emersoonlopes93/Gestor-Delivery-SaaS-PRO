import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const t = await prisma.tenant.findUnique({
    where: { slug: 'pizzaria-demo' }
  });
  
  const mvpPlan = await prisma.billingPlan.findUnique({
    where: { slug: 'mvp-starter' }
  });

  if (t && mvpPlan) {
    const sub = await prisma.tenantBillingSubscription.create({
      data: {
        tenantId: t.id,
        billingPlanId: mvpPlan.id,
        status: 'active',
        startedAt: new Date(),
        requiresPaymentMethod: false
      }
    });
    console.log('--- LINKED DEMO TENANT TO MVP PLAN ---');
    console.log(JSON.stringify(sub, null, 2));
  } else {
    console.log('MISSING TENANT OR PLAN');
  }
}
main().finally(() => prisma.$disconnect());
