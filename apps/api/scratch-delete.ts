import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.chatMessage.deleteMany({
    where: { externalId: 'undefined' },
  });
  console.log('Deleted corrupted messages:', result);
}

main().catch(console.error).finally(() => prisma.$disconnect());
