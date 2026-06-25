import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const badMessages = await prisma.chatMessage.findMany({
    where: { externalId: 'undefined' },
  });
  console.log('Messages with externalId = "undefined":', badMessages);
}

main().catch(console.error).finally(() => prisma.$disconnect());
