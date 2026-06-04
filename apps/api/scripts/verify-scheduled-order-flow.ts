import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/database/prisma.service';
import { TenantContextService } from '../src/common/context/tenant-context.service';
import { PaymentMethod, OrderLineType } from '@gestor/types';

async function main() {
  process.env.REDIS_ENABLED = 'false';

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const tenantContext = app.get(TenantContextService);
  const ordersService = app.get(OrdersService);

  const tenantSlug = process.argv[2] || 'pizzaria-demo';
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    throw new Error(`Tenant not found: ${tenantSlug}`);
  }

  await tenantContext.run(tenant.id, async () => {
    console.log(`Tenant: ${tenantSlug} (${tenant.id})`);

    const selectedSlot = await prisma.timeSlot.findFirst({
      where: {
        tenantId: tenant.id,
        isActive: true,
        currentOccupancy: { lt: 999999 },
      },
      orderBy: { startTime: 'asc' },
    });

    if (!selectedSlot) {
      throw new Error('No available time slot found for tenant.');
    }

    const slotId = selectedSlot.id;
    const slotStart = selectedSlot.startTime;
    const slotOccupancyBefore = selectedSlot.currentOccupancy;
    const slotCapacity = selectedSlot.capacity;

    console.log(`Selected slot: ${slotId}, start=${slotStart.toISOString()}, occupancy=${slotOccupancyBefore}/${slotCapacity}`);

    const productCandidates = await prisma.product.findMany({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        sellableOnline: true,
        isActive: true,
      },
      include: {
        complementGroups: {
          include: { group: true },
        },
        optionGroupLinks: {
          include: { optionGroup: true },
        },
      },
      take: 50,
    });

    const candidate = productCandidates.find((product) => {
      const hasRequiredComplements = product.complementGroups.some((group) => group.group?.isRequired);
      const hasRequiredOptionGroups = product.optionGroupLinks.some((link) => link.optionGroup?.isRequired);
      return !hasRequiredComplements && !hasRequiredOptionGroups;
    });

    if (!candidate) {
      throw new Error('No simple sellable product without required complements/options found.');
    }

    console.log(`Using product id=${candidate.id} name=${candidate.name}`);

    const dto = {
      idempotencyKey: `scheduled-flow-test-${Date.now()}`,
      items: [
        {
          lineType: 'product' as OrderLineType,
          productId: candidate.id,
          quantity: 1,
          complements: [],
        },
      ],
      customerName: 'Scheduled Flow Test',
      customerPhone: '11999990003',
      fulfillmentType: 'pickup' as const,
      payment: { method: PaymentMethod.cash, changeFor: 20 },
      scheduledFor: slotStart.toISOString(),
      timeSlotId: slotId,
      estimatedDuration: 30,
    };

    const order = await ordersService.createOrder(tenantSlug, dto as any);

    console.log('Order created:', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      scheduledFor: order.scheduledFor,
      isScheduled: order.isScheduled,
    });

    const updatedSlot = await prisma.timeSlot.findUnique({ where: { id: slotId } });
    console.log('Slot after creation:', {
      id: updatedSlot?.id,
      occupancy: updatedSlot?.currentOccupancy,
      capacity: updatedSlot?.capacity,
      status: updatedSlot?.status,
    });

    const scheduledOrder = await prisma.scheduledOrder.findFirst({
      where: { tenantId: tenant.id, orderId: order.id },
    });

    console.log('Scheduled order record:', scheduledOrder ? {
      id: scheduledOrder.id,
      orderId: scheduledOrder.orderId,
      customerId: scheduledOrder.customerId,
      timeSlotId: scheduledOrder.timeSlotId,
      scheduledFor: scheduledOrder.scheduledFor.toISOString(),
      status: scheduledOrder.status,
    } : null);
  });

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
