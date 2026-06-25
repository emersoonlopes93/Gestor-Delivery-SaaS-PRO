import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.chatSession.findMany({
    where: { closedAt: null },
    select: { id: true, customerPhone: true, state: true, handoffActive: true, createdAt: true, updatedAt: true }
  });

  const byPhone = new Map<string, typeof sessions>();
  for (const s of sessions) {
    if (!byPhone.has(s.customerPhone)) byPhone.set(s.customerPhone, []);
    byPhone.get(s.customerPhone)!.push(s);
  }

  for (const [phone, list] of byPhone.entries()) {
    if (list.length > 1) {
      console.log(`\nPhone ${phone} has ${list.length} OPEN sessions:`);
      for (const s of list) {
        console.log(`  - ID: ${s.id} | state: ${s.state} | handoff: ${s.handoffActive} | created: ${s.createdAt} | updated: ${s.updatedAt}`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
