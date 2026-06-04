import { PrismaService } from '../src/database/prisma.service';
import { SchedulingService } from '../src/scheduling/scheduling.service';
import { StorefrontService } from '../src/storefront/storefront.service';

const tenantId = process.argv[2];
if (!tenantId) {
  throw new Error('Usage: ts-node -r tsconfig-paths/register scripts/storefront-validate-slots.ts <tenantId>');
}

const cacheManager = {
  get: async () => null,
  set: async () => undefined,
};

async function main() {
  const tenantContext = { getTenantId: () => tenantId };
  const prisma = new PrismaService(tenantContext as any);
  await prisma.$connect();
  const schedulingService = new SchedulingService(prisma, tenantContext as any);
  const storefrontService = new StorefrontService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    schedulingService,
    cacheManager as any,
  );

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });

  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantId}`);
  }

  const slots = await storefrontService.getAvailableSlots(tenant.slug, '2026-06-05');
  console.log('slots count:', slots.length);
  console.log('first 20 slots:', JSON.stringify(slots.slice(0, 20), null, 2));
  const availableMap = slots.map((slot: any) => ({ startTime: slot.startTime, available: slot.available, availableCapacity: slot.availableCapacity, totalCapacity: slot.totalCapacity }));
  console.log('availability sample:', JSON.stringify(availableMap.slice(0, 20), null, 2));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
