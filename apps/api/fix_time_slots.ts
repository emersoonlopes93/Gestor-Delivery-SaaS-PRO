import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fixing time_slots duplicate constraint...');
  
  const slots = await prisma.timeSlot.findMany({
    select: { id: true, tenantId: true, startTime: true }
  });
  
  const seen = new Set<string>();
  const toDelete: string[] = [];
  
  for (const s of slots) {
    const key = `${s.tenantId}_${s.startTime.toISOString()}`;
    if (seen.has(key)) {
      toDelete.push(s.id);
    } else {
      seen.add(key);
    }
  }
  
  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} duplicate time slots...`);
    await prisma.timeSlot.deleteMany({
      where: { id: { in: toDelete } }
    });
  }
  
  console.log('Done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
