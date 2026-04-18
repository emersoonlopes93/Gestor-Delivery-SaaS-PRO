import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const session = await prisma.cashSession.findUnique({
      where: { id: 'test' },
      include: { operator: { select: { name: true } } }
    });
    console.log('Success:', session);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
