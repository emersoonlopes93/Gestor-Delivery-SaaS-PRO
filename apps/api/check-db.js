
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'tenant_settings';
    `;
    console.log('Columns in tenant_settings:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error querying columns:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
