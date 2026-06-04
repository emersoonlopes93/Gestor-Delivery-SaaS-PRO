import { PrismaService } from '../src/database/prisma.service';
import { SchedulingService } from '../src/scheduling/scheduling.service';
import { SchedulingGeneratorService } from '../src/scheduling/scheduling-generator.service';

const tenantId = process.argv[2];
if (!tenantId) {
  throw new Error('Usage: ts-node -r tsconfig-paths/register scripts/scheduling-generate-slots.ts <tenantId>');
}

const tenantContext = {
  getTenantId: () => tenantId,
};

async function main() {
  const prisma = new PrismaService(tenantContext as any);
  await prisma.$connect();

  const schedulingService = new SchedulingService(prisma, tenantContext as any);
  const generator = new SchedulingGeneratorService(prisma, tenantContext as any, schedulingService);

  const result = await generator.generateSlotsForNextDays();
  console.log('generateSlotsForNextDays result', JSON.stringify(result, null, 2));

  const count = await prisma.timeSlot.count({ where: { tenantId } });
  console.log('time_slots count:', count);

  const duplicates = await prisma.$queryRawUnsafe(
    `SELECT start_time, COUNT(*) AS cnt FROM time_slots WHERE tenant_id = $1 GROUP BY start_time HAVING COUNT(*) > 1`,
    tenantId,
  );
  console.log('duplicates:', JSON.stringify(duplicates, null, 2));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
