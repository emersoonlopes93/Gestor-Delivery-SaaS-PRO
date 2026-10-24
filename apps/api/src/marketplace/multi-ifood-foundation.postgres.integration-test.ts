import { MarketplaceConnectionStatus, MarketplaceProvider, Prisma, PrismaClient } from '@prisma/client';

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabaseUrls(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const parsedDatabaseUrl = new URL(databaseUrl);
  const parsedDirectUrl = new URL(directUrl);
  if (!allowedDatabaseHosts.has(parsedDatabaseUrl.hostname) || !allowedDatabaseHosts.has(parsedDirectUrl.hostname)) {
    throw new Error('Multi-iFood integration test refused a non-local database host.');
  }
  if (parsedDatabaseUrl.host !== parsedDirectUrl.host || parsedDatabaseUrl.pathname !== parsedDirectUrl.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same ephemeral PostgreSQL database.');
  }
}

describe('Multi-iFood Foundation V1 PostgreSQL invariants', () => {
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    assertEphemeralDatabaseUrls();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('isolates connections, credentials, status, orders and event identity by merchant', async () => {
    const [tenant, otherTenant] = await Promise.all([
      prisma.tenant.create({ data: { name: `Multi iFood ${suffix}`, slug: `multi-ifood-${suffix}` } }),
      prisma.tenant.create({ data: { name: `Other iFood ${suffix}`, slug: `other-ifood-${suffix}` } }),
    ]);
    tenantIds.push(tenant.id, otherTenant.id);

    const [connectionA, connectionB] = await Promise.all([
      prisma.marketplaceConnection.create({
        data: {
          tenantId: tenant.id,
          provider: MarketplaceProvider.IFOOD,
          externalMerchantId: `merchant-a-${suffix}`,
          status: MarketplaceConnectionStatus.CONNECTED,
          accessTokenEnc: `test-cipher-a-${suffix}`,
        },
      }),
      prisma.marketplaceConnection.create({
        data: {
          tenantId: tenant.id,
          provider: MarketplaceProvider.IFOOD,
          externalMerchantId: `merchant-b-${suffix}`,
          status: MarketplaceConnectionStatus.CONNECTED,
          accessTokenEnc: `test-cipher-b-${suffix}`,
        },
      }),
    ]);

    expect(connectionA.accessTokenEnc).not.toBe(connectionB.accessTokenEnc);
    await expect(prisma.marketplaceConnection.create({
      data: {
        tenantId: otherTenant.id,
        provider: MarketplaceProvider.IFOOD,
        externalMerchantId: connectionA.externalMerchantId,
      },
    })).rejects.toMatchObject({ code: 'P2002' });

    await prisma.marketplaceConnection.update({
      where: { id: connectionA.id },
      data: { status: MarketplaceConnectionStatus.ERROR },
    });
    const unaffectedConnection = await prisma.marketplaceConnection.findUniqueOrThrow({ where: { id: connectionB.id } });
    expect(unaffectedConnection.status).toBe(MarketplaceConnectionStatus.CONNECTED);

    const externalOrderId = `shared-order-${suffix}`;
    const [orderA, orderB] = await Promise.all([
      prisma.marketplaceOrder.create({
        data: {
          tenantId: tenant.id,
          connectionId: connectionA.id,
          provider: MarketplaceProvider.IFOOD,
          externalOrderId,
          rawPayload: {} as Prisma.InputJsonObject,
        },
      }),
      prisma.marketplaceOrder.create({
        data: {
          tenantId: tenant.id,
          connectionId: connectionB.id,
          provider: MarketplaceProvider.IFOOD,
          externalOrderId,
          rawPayload: {} as Prisma.InputJsonObject,
        },
      }),
    ]);
    expect(orderA.connectionId).not.toBe(orderB.connectionId);
    await expect(prisma.marketplaceOrder.create({
      data: {
        tenantId: tenant.id,
        connectionId: connectionA.id,
        provider: MarketplaceProvider.IFOOD,
        externalOrderId,
        rawPayload: {} as Prisma.InputJsonObject,
      },
    })).rejects.toMatchObject({ code: 'P2002' });

    const eventId = `shared-event-${suffix}`;
    const [eventA, eventB] = await Promise.all([
      prisma.marketplaceEventInbox.create({
        data: {
          provider: MarketplaceProvider.IFOOD,
          eventId,
          tenantId: tenant.id,
          connectionId: connectionA.id,
          externalMerchantId: connectionA.externalMerchantId,
          externalOrderId,
          correlationId: `correlation-a-${suffix}`,
          payloadHash: `payload-a-${suffix}`,
          dedupeKey: `connection-a:${eventId}`,
          rawPayload: {} as Prisma.InputJsonObject,
        },
      }),
      prisma.marketplaceEventInbox.create({
        data: {
          provider: MarketplaceProvider.IFOOD,
          eventId,
          tenantId: tenant.id,
          connectionId: connectionB.id,
          externalMerchantId: connectionB.externalMerchantId,
          externalOrderId,
          correlationId: `correlation-b-${suffix}`,
          payloadHash: `payload-b-${suffix}`,
          dedupeKey: `connection-b:${eventId}`,
          rawPayload: {} as Prisma.InputJsonObject,
        },
      }),
    ]);
    expect(eventA.connectionId).not.toBe(eventB.connectionId);
  });
});
