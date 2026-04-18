import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
prisma.$use(async (params, next) => {
    if (params.action === 'findUnique') {
        params.action = 'findFirst';
        params.args.where = { ...params.args.where, tenantId: 'dummy' };
    }
    return next(params);
});

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
