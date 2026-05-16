const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- SystemConfig ---');
  const systemConfig = await prisma.systemConfig.findUnique({
    where: { id: 'global' }
  });
  console.log(JSON.stringify(systemConfig, null, 2));

  console.log('\n--- Tenants ---');
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true }
  });
  console.log(JSON.stringify(tenants, null, 2));

  console.log('\n--- AiAgentConfig for Demo Tenant ---');
  const demoTenant = tenants.find(t => t.slug === 'demo' || t.name.toLowerCase().includes('demo'));
  if (demoTenant) {
    const aiConfig = await prisma.aiAgentConfig.findUnique({
      where: { tenantId: demoTenant.id }
    });
    console.log(`Demo Tenant ID: ${demoTenant.id}`);
    console.log(JSON.stringify(aiConfig, null, 2));
  } else {
    console.log('Demo tenant not found');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
