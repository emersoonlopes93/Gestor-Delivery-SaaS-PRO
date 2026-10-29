import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { PaymentMethod, type CreateOrderDTO } from '@gestor/types';
import { AvailabilityService } from '../catalog/publication/availability.service';
import { CheckoutValidatorService } from '../orders/checkout-validator.service';
import { CouponsService } from '../promotions/coupons.service';
import { CashbackService } from '../promotions/cashback.service';
import { DeliveryRateService } from '../delivery/delivery-rate.service';
import { PizzaEngineService } from '../catalog/pizza-engine.service';
import { UpsellsService } from '../catalog/upsells.service';
import { FeatureControlService } from '../feature-control/feature-control.service';
import { ComboComponentEligibilityService } from '../catalog/combo-component-eligibility.service';
import { TenantActivationService } from './tenant-activation.service';
import { OrdersService } from '../orders/orders.service';
import { CustomerService } from '../crm/customer.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { RecipeExpansionService } from '../inventory/recipe-expansion.service';
import { ConfigurableRecipeCompositionService } from '../inventory/configurable-recipe-composition.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabaseUrls(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Commercial V4 integration test requires NODE_ENV=test.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Commercial V4 integration test refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Commercial V4 activation with ephemeral PostgreSQL', () => {
  const prisma = new PrismaClient();
  const availability = new AvailabilityService(prisma as never);
  const activation = new TenantActivationService(prisma as never, availability);
  const tenantIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => { assertEphemeralDatabaseUrls(); await prisma.$connect(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.$disconnect(); });

  async function fixture(label: string) {
    const tenant = await prisma.tenant.create({ data: { name: label, slug: `commercial-v4-${label}-${suffix}` } });
    tenantIds.push(tenant.id);
    await prisma.tenantSettings.create({ data: { tenantId: tenant.id, street: 'Rua A', number: '1', neighborhood: 'Centro', zipCode: '01001000', pickupEnabled: true, paymentMethods: ['cash'] } });
    await prisma.tenantOperatingHours.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId: tenant.id, dayOfWeek, isOpen: true, openTime: '00:00', closeTime: '23:59' })) });
    const category = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Categoria', slug: `cat-${suffix}-${label}` } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, categoryId: category.id, name: 'Produto', slug: `prod-${suffix}-${label}`, basePrice: 10 } });
    await prisma.tenantOnboarding.create({ data: { tenantId: tenant.id, completedAt: new Date() } });
    return { tenant, product };
  }

  it('keeps pickup with cash operational without a delivery coverage or Pix key', async () => {
    const { tenant, product } = await fixture('pickup');
    const status = await availability.getStoreStatus(tenant.id);
    const decision = await availability.decide({ tenantId: tenant.id, productId: product.id, channel: 'storefront_pickup' });
    const projection = await activation.getStatus(tenant.id);
    expect(status.reason).toBe('OPEN');
    expect(decision.canSell).toBe(true);
    expect(projection.operationallyReady).toBe(true);
    expect(projection.firstStorefrontOrder).toBeNull();
  });

  it('validates a real pickup cash checkout without Pix or delivery coverage', async () => {
    const { tenant, product } = await fixture('validator');
    const validator = new CheckoutValidatorService(
      prisma as never,
      new CouponsService(prisma as never),
      new CashbackService(prisma as never),
      new DeliveryRateService(prisma.deliveryRateRule as never, prisma.deliveryCoverageConfig as never, prisma as never, undefined as never, undefined as never),
      availability,
      new PizzaEngineService({ tenantClient: prisma } as never),
      new UpsellsService(prisma as never),
      new FeatureControlService(prisma as never, undefined as never, undefined as never, undefined as never),
      new ComboComponentEligibilityService(prisma as never),
    );
    const result = await validator.validate(tenant.slug, [{ lineType: 'product', productId: product.id, quantity: 1 }], { channel: 'storefront_pickup', payment: { method: PaymentMethod.cash } });
    expect(result.tenantId).toBe(tenant.id);
    expect(result.lines).toHaveLength(1);
    expect(result.itemsSubtotal).toBe(10);
    expect(result.deliveryFee).toBe(0);
    expect(result.total).toBe(10);
    expect(await prisma.order.count({ where: { tenantId: tenant.id } })).toBe(0);
  });

  it('persists a pickup cash order through real OrdersService and PostgreSQL', async () => {
    const { tenant, product } = await fixture('realorder');
    const cashback = new CashbackService(prisma as never);
    const pizza = new PizzaEngineService({ tenantClient: prisma } as never);
    const combo = new ComboComponentEligibilityService(prisma as never);
    const validator = new CheckoutValidatorService(
      prisma as never,
      new CouponsService(prisma as never),
      cashback,
      new DeliveryRateService(
        prisma.deliveryRateRule as never,
        prisma.deliveryCoverageConfig as never,
        prisma as never,
        undefined as never,
        undefined as never,
      ),
      availability,
      pizza,
      new UpsellsService(prisma as never),
      new FeatureControlService(prisma as never, undefined as never, undefined as never, undefined as never),
      combo,
    );
    const inventory = new TheoreticalStockService(
      prisma as never,
      new ConfigurableRecipeCompositionService(prisma as never, new RecipeExpansionService(prisma as never), pizza),
      combo,
    );
    const events = { emitNewOrder: jest.fn(), emitOrderChanged: jest.fn() };
    const key = `b1-${suffix}`;
    const orders = new OrdersService(
      prisma as never,
      validator,
      new CustomerService(prisma as never),
      cashback,
      {} as never,
      inventory,
      {} as never,
      {} as never,
      {} as never,
      events as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const dto: CreateOrderDTO = {
      idempotencyKey: key,
      items: [{ lineType: 'product', productId: product.id, quantity: 1 }],
      customerName: 'Cliente B1',
      customerPhone: '11987654321',
      fulfillmentType: 'pickup',
      payment: { method: PaymentMethod.cash },
      sourceChannel: 'direct_online',
    };
    const created = await orders.createOrder(tenant.slug, dto);
    const order = await prisma.order.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: tenant.id, idempotencyKey: key } },
      include: { items: true, timeline: true },
    });
    expect(order).not.toBeNull();
    expect(created.id).toBe(order?.id);
    expect(order?.items).toHaveLength(1);
    expect(order?.timeline.length).toBeGreaterThanOrEqual(1);
    expect((await activation.getStatus(tenant.id)).firstStorefrontOrder?.status).toBe('pending');

    const [orderCountBeforeReplay, itemCountBeforeReplay, timelineCountBeforeReplay, tenantBeforeReplay] = await Promise.all([
      prisma.order.count({ where: { tenantId: tenant.id } }),
      prisma.orderItem.count({ where: { orderId: created.id } }),
      prisma.orderTimeline.count({ where: { orderId: created.id } }),
      prisma.tenant.findUnique({ where: { id: tenant.id }, select: { orderSequence: true } }),
    ]);

    const replayed = await orders.createOrder(tenant.slug, dto);

    const [orderCountAfterReplay, ordersWithKeyAfterReplay, itemCountAfterReplay, timelineCountAfterReplay, tenantAfterReplay] = await Promise.all([
      prisma.order.count({ where: { tenantId: tenant.id } }),
      prisma.order.count({ where: { tenantId: tenant.id, idempotencyKey: key } }),
      prisma.orderItem.count({ where: { orderId: created.id } }),
      prisma.orderTimeline.count({ where: { orderId: created.id } }),
      prisma.tenant.findUnique({ where: { id: tenant.id }, select: { orderSequence: true } }),
    ]);

    expect(replayed.id).toBe(created.id);
    expect(replayed.orderNumber).toBe(created.orderNumber);
    expect(orderCountBeforeReplay).toBe(1);
    expect(orderCountAfterReplay).toBe(1);
    expect(ordersWithKeyAfterReplay).toBe(1);
    expect(itemCountBeforeReplay).toBe(1);
    expect(itemCountAfterReplay).toBe(itemCountBeforeReplay);
    expect(timelineCountAfterReplay).toBe(timelineCountBeforeReplay);
    expect(tenantAfterReplay?.orderSequence).toBe(tenantBeforeReplay?.orderSequence);
    expect((await activation.getStatus(tenant.id)).firstStorefrontOrder?.status).toBe('pending');

    // B3: new checkout must be rejected while the store is paused.
    const [ordersBeforePause, itemsBeforePause, timelineBeforePause, tenantBeforePause] = await Promise.all([
      prisma.order.count({ where: { tenantId: tenant.id } }),
      prisma.orderItem.count({ where: { tenantId: tenant.id } }),
      prisma.orderTimeline.count({ where: { tenantId: tenant.id } }),
      prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { orderSequence: true } }),
    ]);
    const emittedNewOrderBeforePause = events.emitNewOrder.mock.calls.length;
    const emittedChangedBeforePause = events.emitOrderChanged.mock.calls.length;
    await prisma.tenantSettings.update({
      where: { tenantId: tenant.id },
      data: { isStorePaused: true, storePauseReason: 'Loja pausada para B3' },
    });
    try {
      const pausedDto: CreateOrderDTO = { ...dto, idempotencyKey: `b3-paused-${suffix}` };
      await expect(orders.createOrder(tenant.slug, pausedDto)).rejects.toThrow('Loja pausada para B3');
      const [ordersAfterPause, itemsAfterPause, timelineAfterPause, tenantAfterPause] = await Promise.all([
        prisma.order.count({ where: { tenantId: tenant.id } }),
        prisma.orderItem.count({ where: { tenantId: tenant.id } }),
        prisma.orderTimeline.count({ where: { tenantId: tenant.id } }),
        prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, select: { orderSequence: true } }),
      ]);
      expect(ordersAfterPause).toBe(ordersBeforePause);
      expect(itemsAfterPause).toBe(itemsBeforePause);
      expect(timelineAfterPause).toBe(timelineBeforePause);
      expect(tenantAfterPause.orderSequence).toBe(tenantBeforePause.orderSequence);
      expect(events.emitNewOrder.mock.calls).toHaveLength(emittedNewOrderBeforePause);
      expect(events.emitOrderChanged.mock.calls).toHaveLength(emittedChangedBeforePause);
    } finally {
      await prisma.tenantSettings.update({
        where: { tenantId: tenant.id },
        data: { isStorePaused: false, storePauseReason: null },
      });
    }
  });

  it('derives the first storefront order from a persisted tenant-scoped order only', async () => {
    const first = await fixture('first');
    const second = await fixture('other');
    await prisma.order.create({ data: { tenantId: first.tenant.id, orderNumber: `V4${suffix.replace(/[^a-z0-9]/gi, '').slice(-12)}`, fulfillmentType: 'pickup', customerName: 'Test', customerPhone: '11999999999', itemsSubtotal: 10, total: 10, idempotencyKey: `v4-${suffix}`, publicTrackingToken: `v4-token-${suffix}`, sourceChannel: 'direct_online' } });
    const [a, b] = await Promise.all([activation.getStatus(first.tenant.id), activation.getStatus(second.tenant.id)]);
    expect(a.firstStorefrontOrder?.status).toBe('pending');
    expect(a.firstCompletedStorefrontOrder).toBeNull();
    expect(b.firstStorefrontOrder).toBeNull();
  });
});
