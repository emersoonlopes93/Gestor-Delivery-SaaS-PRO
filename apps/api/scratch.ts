import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const instances = await prisma.whatsAppInstance.findMany({
    select: {
      tenantId: true,
      instanceName: true,
      status: true,
      phoneNumber: true,
      evolutionInstanceId: true
    }
  });

  console.log('WhatsApp Instances:');
  console.table(instances);

  const tenantHealth = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      whatsappInstance: {
        select: {
          id: true,
          status: true,
          phoneNumber: true
        }
      }
    }
  });
  console.log('Tenants with WhatsApp:');
  console.table(tenantHealth);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
