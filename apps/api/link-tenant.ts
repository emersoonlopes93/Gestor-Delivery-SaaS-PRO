import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const t = await prisma.tenant.findUnique({
    where: { slug: 'pizzaria-demo' }
  });
  
  const plan = await prisma.billingPlan.findUnique({
    where: { slug: 'revenue-growth' }
  });

  if (t && plan) {
    const existing = await prisma.tenantBillingSubscription.findFirst({
      where: { tenantId: t.id },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      console.log('TENANT ALREADY HAS A BILLING V2 SUBSCRIPTION');
      return;
    }
    const sub = await prisma.tenantBillingSubscription.create({
      data: {
        tenantId: t.id,
        billingPlanId: plan.id,
        status: 'active',
        startedAt: new Date(),
        requiresPaymentMethod: false
      }
    });
    console.log('--- LINKED DEMO TENANT TO REVENUE GROWTH PLAN ---');
    console.log(JSON.stringify(sub, null, 2));
  } else {
    console.log('MISSING TENANT OR PLAN');
  }
}
main().finally(() => prisma.$disconnect());
