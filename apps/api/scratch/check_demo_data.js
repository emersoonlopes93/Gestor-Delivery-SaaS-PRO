const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { slug: 'pizzaria-demo' }
  });
  
  if (tenants.length > 0) {
    const tenantId = tenants[0].id;
    const customers = await prisma.customer.findMany({
      where: { tenantId }
    });
    console.log(`Customers for Pizzaria Demo (${tenantId}):`);
    console.log(JSON.stringify(customers, null, 2));
    
    const sessions = await prisma.chatSession.findMany({
      where: { tenantId }
    });
    console.log(`\nChat Sessions for Pizzaria Demo:`);
    console.log(JSON.stringify(sessions, null, 2));
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
