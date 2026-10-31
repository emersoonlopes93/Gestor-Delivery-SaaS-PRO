import { BadRequestException } from '@nestjs/common';
import {
  DriverShiftStatus,
  DriverStatus,
  FulfillmentType,
  MarketplaceConnectionStatus,
  MarketplaceDeliveryOwnership,
  MarketplaceProvider,
  OrderStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { DeliveryRunsService } from './delivery-runs.service';
import { DriverEarningsService } from './driver-earnings.service';
import { RoutingV2Service } from './routing-v2.service';
import { SmartDispatchService } from './smart-dispatch.service';

const enabled = process.env.ROUTING_V2_POSTGRES_E2E === '1';
const describePostgres = enabled ? describe : describe.skip;
jest.setTimeout(60_000);

function assertEphemeralDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for Routing V2 PostgreSQL E2E.');
  const parsed = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error('Routing V2 PostgreSQL E2E refused a non-local database host.');
  }
}

describePostgres('Routing V2 logistics ownership PostgreSQL E2E', () => {
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let tenantId = '';

  beforeAll(async () => {
    assertEphemeralDatabase();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('creates one deterministic own-fleet route and excludes provider or unknown orders', async () => {
    const tenant = await prisma.tenant.create({
      data: { name: `Routing V2 ${suffix}`, slug: `routing-v2-${suffix}` },
    });
    tenantId = tenant.id;
    await prisma.tenantSettings.create({
      data: {
        tenantId,
        lat: 0,
        lng: 0,
        deliveryRunRequiresAcceptance: true,
        smartDispatchMode: 'ASSISTED',
        smartDispatchUseQueue: true,
        smartDispatchBypassDistance: false,
        smartDispatchAutoCarona: true,
        smartDispatchMaxStops: 3,
        smartDispatchGroupingKm: 10,
      },
    });
    const driver = await prisma.deliveryDriver.create({
      data: {
        tenantId,
        name: 'Routing Driver',
        phone: `e2e-${suffix.slice(-20)}`,
        status: DriverStatus.available,
        currentLat: 0,
        currentLng: 0,
        lastLocationAt: new Date(),
        dispatchQueueJoinedAt: new Date('2026-09-04T12:00:00.000Z'),
      },
    });
    await prisma.driverShift.create({
      data: { tenantId, driverId: driver.id, status: DriverShiftStatus.ACTIVE },
    });
    const connection = await prisma.marketplaceConnection.create({
      data: {
        tenantId,
        provider: MarketplaceProvider.IFOOD,
        status: MarketplaceConnectionStatus.CONNECTED,
        externalMerchantId: `routing-merchant-${suffix}`,
      },
    });

    const createOrder = async (
      label: string,
      longitude: number,
      createdAt: Date,
      ownership?: MarketplaceDeliveryOwnership,
    ) => prisma.order.create({
      data: {
        tenantId,
        orderNumber: label,
        status: OrderStatus.ready_for_delivery,
        fulfillmentType: FulfillmentType.delivery,
        customerName: 'Routing Customer',
        customerPhone: 'local-e2e',
        itemsSubtotal: new Prisma.Decimal(10),
        total: new Prisma.Decimal(10),
        idempotencyKey: `routing-${label}-${suffix}`,
        publicTrackingToken: `routing-token-${label}-${suffix}`,
        deliveryLat: 0,
        deliveryLng: longitude,
        createdAt,
        deliveryAddress: {
          create: {
            tenantId,
            street: 'Local E2E',
            number: label,
            neighborhood: 'Test',
            city: 'Test',
            state: 'SP',
            zipCode: '00000000',
            lat: 0,
            lng: longitude,
          },
        },
        ...(ownership
          ? {
            marketplaceOrders: {
              create: {
                tenantId,
                connectionId: connection.id,
                provider: MarketplaceProvider.IFOOD,
                externalOrderId: `external-${label}-${suffix}`,
                deliveryOwnership: ownership,
                rawPayload: {},
              },
            },
          }
          : {}),
      },
    });

    const [native, merchantNear, merchantMid, provider, unknown] = await Promise.all([
      createOrder('native-far', 0.03, new Date('2026-09-04T12:00:00.000Z')),
      createOrder('merchant-near', 0.01, new Date('2026-09-04T12:01:00.000Z'), MarketplaceDeliveryOwnership.MERCHANT),
      createOrder('merchant-mid', 0.02, new Date('2026-09-04T12:02:00.000Z'), MarketplaceDeliveryOwnership.MERCHANT),
      createOrder('provider', 0.015, new Date('2026-09-04T12:03:00.000Z'), MarketplaceDeliveryOwnership.PROVIDER),
      createOrder('unknown', 0.025, new Date('2026-09-04T12:04:00.000Z'), MarketplaceDeliveryOwnership.UNKNOWN),
    ]);

    const fakeRouting = {
      route: jest.fn(async (origin: { lat: number; lng: number }, stops: Array<{ lat: number; lng: number }>) => ({
        provider: 'fake-routing',
        geometry: [origin, ...stops],
        legs: stops.map((_stop, index) => ({ distanceMeters: (index + 1) * 1_000, durationSeconds: (index + 1) * 300 })),
        distanceMeters: 6_000,
        durationSeconds: 1_800,
      })),
    };
    const routing = new RoutingV2Service(prisma as never, fakeRouting as never);
    const earnings = new DriverEarningsService(prisma as never);
    const runs = new DeliveryRunsService(prisma as never, earnings, routing);
    const smartDispatch = new SmartDispatchService(prisma as never, runs);

    const suggestion = await smartDispatch.suggestion(tenantId);
    expect(suggestion.orderIds).toEqual([native.id, merchantNear.id, merchantMid.id]);
    expect(suggestion.orderIds).not.toContain(provider.id);
    expect(suggestion.orderIds).not.toContain(unknown.id);

    const created = await smartDispatch.accept(tenantId, 'routing-e2e-actor', driver.id, suggestion.orderIds);
    const persisted = await prisma.deliveryRun.findUniqueOrThrow({
      where: { id: created.id },
      include: { stops: { orderBy: { sequence: 'asc' } } },
    });
    expect(persisted.stops.map((stop) => stop.orderId)).toEqual([merchantNear.id, merchantMid.id, native.id]);
    expect(persisted.stops.every((stop) => stop.estimatedArrivalAt !== null)).toBe(true);
    expect(persisted.routeProvider).toBe('fake-routing');
    expect(fakeRouting.route).toHaveBeenCalledTimes(1);

    await expect(
      smartDispatch.accept(tenantId, 'routing-e2e-actor', driver.id, suggestion.orderIds),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.deliveryRun.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.deliveryStop.count({ where: { tenantId } })).toBe(3);
  });
});
