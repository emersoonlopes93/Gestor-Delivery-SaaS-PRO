import { strict as assert } from 'node:assert';
import { ConfigService } from '@nestjs/config';
import {
  MarketplaceConnectionStatus,
  MarketplacePollingStatus,
  MarketplaceProvider,
  PrismaClient,
  PrintType,
} from '@prisma/client';
import { KdsService } from '../src/kds/kds.service';
import { loadApiEnvFiles } from '../src/config/env-paths';
import { IfoodApiError } from '../src/marketplace/providers/ifood-api.error';
import { MarketplaceCredentialService } from '../src/marketplace/services/marketplace-credential.service';
import { MarketplacePollingService } from '../src/marketplace/services/marketplace-polling.service';
import { IfoodTokenService } from '../src/marketplace/services/ifood-token.service';

type JsonObject = Record<string, unknown>;

loadApiEnvFiles();

const allowedDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);
const apiBase = (process.env.MULTI_IFOOD_E2E_API_BASE_URL ?? 'http://127.0.0.1:3333/api/v1').replace(/\/$/, '');
const runId = (process.env.MULTI_IFOOD_E2E_RUN_ID ?? `local-${Date.now()}`).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
const fakePassword = process.env.MULTI_IFOOD_E2E_PASSWORD ?? 'LocalE2E!123';
const alphaEmail = `multi-ifood-alpha-${runId}@e2e.local`;
const betaEmail = `multi-ifood-beta-${runId}@e2e.local`;
const alphaShopName = `Tenant Alpha Multi iFood E2E ${runId}`;
const betaShopName = `Tenant Beta Multi iFood E2E ${runId}`;

function assertEphemeralDatabaseUrls(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const parsedDatabaseUrl = new URL(databaseUrl);
  const parsedDirectUrl = new URL(directUrl);
  if (!allowedDatabaseHosts.has(parsedDatabaseUrl.hostname) || !allowedDatabaseHosts.has(parsedDirectUrl.hostname)) {
    throw new Error('Multi-iFood E2E refused a non-local PostgreSQL host.');
  }
  if (parsedDatabaseUrl.host !== parsedDirectUrl.host || parsedDatabaseUrl.pathname !== parsedDirectUrl.pathname) {
    throw new Error('DATABASE_URL and DIRECT_URL must target the same ephemeral PostgreSQL database.');
  }
  const parsedApi = new URL(apiBase);
  if (!allowedDatabaseHosts.has(parsedApi.hostname)) throw new Error('Multi-iFood E2E refused a non-local API host.');
}

function unwrap<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'success' in value && 'data' in value) {
    return (value as { data: T }).data;
  }
  return value as T;
}

function readString(value: JsonObject, key: string): string {
  const entry = value[key];
  if (typeof entry !== 'string' || entry.length === 0) throw new Error(`${key} must be a non-empty string`);
  return entry;
}

class ApiClient {
  constructor(private readonly token?: string) {}

  withToken(token: string): ApiClient {
    return new ApiClient(token);
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    expectedStatuses: number[] = [200, 201],
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...(extraHeaders ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    assert.ok(
      expectedStatuses.includes(response.status),
      `${method} ${path} returned ${response.status}: ${JSON.stringify(parsed)}`,
    );
    return unwrap<T>(parsed);
  }
}

function orderEvent(eventId: string, merchantId: string, storeId: string, externalOrderId: string): JsonObject {
  return {
    id: eventId,
    topic: 'ORDER_PLACED',
    merchantId,
    storeId,
    createdAt: new Date().toISOString(),
    order: {
      id: externalOrderId,
      displayId: `${externalOrderId}-display`,
      status: 'PLACED',
      fulfillmentType: 'delivery',
      customer: { name: `Cliente ${merchantId}`, phone: '5511999999001', email: `${merchantId}@e2e.local` },
      deliveryAddress: {
        street: 'Rua Local E2E', number: '100', neighborhood: 'Centro', city: 'Sao Paulo', state: 'SP', zipCode: '01001000',
      },
      items: [{ id: 'item-1', name: 'Produto E2E', quantity: 1, unitPrice: 35, totalPrice: 35 }],
    },
  };
}

async function main(): Promise<void> {
  assertEphemeralDatabaseUrls();
  const prisma = new PrismaClient();
  await prisma.$connect();
  const checks: string[] = [];
  const anonymous = new ApiClient();

  try {
    const alphaRegistration = await anonymous.request<JsonObject>('POST', '/auth/tenant/register', {
      ownerName: 'Owner Alpha E2E', shopName: alphaShopName, phone: '5511999990001', email: alphaEmail, password: fakePassword,
    });
    const betaRegistration = await anonymous.request<JsonObject>('POST', '/auth/tenant/register', {
      ownerName: 'Owner Beta E2E', shopName: betaShopName, phone: '5511999990002', email: betaEmail, password: fakePassword,
    });
    const alpha = anonymous.withToken(readString(alphaRegistration, 'accessToken'));
    const beta = anonymous.withToken(readString(betaRegistration, 'accessToken'));
    const [alphaUser, betaUser] = await Promise.all([
      prisma.tenantUser.findFirstOrThrow({ where: { email: alphaEmail }, include: { tenant: true } }),
      prisma.tenantUser.findFirstOrThrow({ where: { email: betaEmail }, include: { tenant: true } }),
    ]);

    await Promise.all([alphaUser.tenantId, betaUser.tenantId].map((tenantId) => prisma.featureTenantOverride.upsert({
      where: { tenantId_featureKey: { tenantId, featureKey: 'ifood_marketplace' } },
      update: { mode: 'enabled', reason: 'local_multi_ifood_e2e' },
      create: { tenantId, featureKey: 'ifood_marketplace', mode: 'enabled', reason: 'local_multi_ifood_e2e' },
    })));
    await Promise.all([alphaUser.tenantId, betaUser.tenantId].map((tenantId) => prisma.tenantFeatureEntitlementOverride.upsert({
      where: { tenantId_featureKey: { tenantId, featureKey: 'ifood_integration' } },
      update: { enabled: true, source: 'local_e2e', reason: 'local_multi_ifood_e2e' },
      create: { tenantId, featureKey: 'ifood_integration', enabled: true, source: 'local_e2e', reason: 'local_multi_ifood_e2e' },
    })));
    await prisma.featureGlobalSetting.upsert({
      where: { featureKey: 'ifood_marketplace' },
      update: { status: 'enabled', reason: 'local_multi_ifood_e2e' },
      create: { featureKey: 'ifood_marketplace', status: 'enabled', reason: 'local_multi_ifood_e2e' },
    });

    const expiration = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const connectionA = await alpha.request<JsonObject>('POST', '/marketplaces/ifood/connect/manual', {
      externalMerchantId: 'merchant-alpha-a', externalStoreId: 'store-alpha-a', displayName: 'Loja Alpha A',
      authType: 'refresh_token', accessToken: 'fake-access-alpha-a', refreshToken: 'fake-refresh-alpha-a', tokenExpiresAt: expiration,
      settingsJson: { autoConfirmOrders: false, importAsStatus: 'pending' },
    });
    const connectionB = await alpha.request<JsonObject>('POST', '/marketplaces/ifood/connect/manual', {
      externalMerchantId: 'merchant-alpha-b', externalStoreId: 'store-alpha-b', displayName: 'Loja Alpha B',
      authType: 'refresh_token', accessToken: 'fake-access-alpha-b', refreshToken: 'fake-refresh-alpha-b', tokenExpiresAt: expiration,
      settingsJson: { autoConfirmOrders: false, importAsStatus: 'pending' },
    });
    const connectionC = await beta.request<JsonObject>('POST', '/marketplaces/ifood/connect/manual', {
      externalMerchantId: 'merchant-beta-c', externalStoreId: 'store-beta-c', displayName: 'Loja Beta C',
      authType: 'refresh_token', accessToken: 'fake-access-beta-c', refreshToken: 'fake-refresh-beta-c', tokenExpiresAt: expiration,
      settingsJson: { autoConfirmOrders: false, importAsStatus: 'pending' },
    });
    const connectionAId = readString(connectionA, 'id');
    const connectionBId = readString(connectionB, 'id');
    const connectionCId = readString(connectionC, 'id');

    const alphaConnections = await alpha.request<JsonObject[]>('GET', '/marketplaces/connections');
    assert.deepEqual(new Set(alphaConnections.map((row) => row.id)), new Set([connectionAId, connectionBId]));
    const serializedConnections = JSON.stringify(alphaConnections);
    for (const secret of ['fake-access-alpha-a', 'fake-refresh-alpha-a', 'fake-access-alpha-b', 'fake-refresh-alpha-b']) {
      assert.equal(serializedConnections.includes(secret), false, 'connection API exposed a fake credential');
    }
    const storedConnections = await prisma.marketplaceConnection.findMany({
      where: { id: { in: [connectionAId, connectionBId] } }, orderBy: { externalMerchantId: 'asc' },
    });
    assert.equal(storedConnections.length, 2);
    assert.notEqual(storedConnections[0].accessTokenEnc, storedConnections[1].accessTokenEnc);
    assert.ok(storedConnections.every((row) => row.accessTokenEnc?.startsWith('enc:v2:')));
    checks.push('two connections and encrypted credentials are isolated');

    await Promise.all([
      alpha.request('GET', `/marketplaces/connections/${connectionCId}`, undefined, [404]),
      alpha.request('PATCH', `/marketplaces/connections/${connectionCId}`, { displayName: 'forbidden' }, [404]),
      alpha.request('DELETE', `/marketplaces/connections/${connectionCId}`, undefined, [404]),
      beta.request('GET', `/marketplaces/connections/${connectionAId}`, undefined, [404]),
      beta.request('PATCH', `/marketplaces/connections/${connectionAId}`, { displayName: 'forbidden' }, [404]),
      beta.request('DELETE', `/marketplaces/connections/${connectionAId}`, undefined, [404]),
    ]);
    await beta.request('POST', '/marketplaces/ifood/connect/manual', {
      externalMerchantId: 'merchant-alpha-a', externalStoreId: 'store-beta-duplicate-merchant', displayName: 'Duplicate Merchant',
    }, [409]);
    await beta.request('POST', '/marketplaces/ifood/connect/manual', {
      externalMerchantId: 'merchant-beta-duplicate-store', externalStoreId: 'store-alpha-a', displayName: 'Duplicate Store',
    }, [409]);
    checks.push('cross-tenant routes and global merchant/store duplicates are blocked');

    const pollingSettings = { pollingFallbackEnabled: true, presenceMode: 'POLLING', autoConfirmOrders: false, importAsStatus: 'pending' };
    await prisma.marketplaceConnection.updateMany({
      where: { id: { in: [connectionAId, connectionBId] } },
      data: { settingsJson: pollingSettings },
    });
    const fakeProvider = {
      pollEvents: async (input: { connection: { id: string } }): Promise<JsonObject[]> => {
        if (input.connection.id === connectionAId) throw new IfoodApiError('fake provider failure A', true, 503, 'FAKE_A');
        return [];
      },
      parsePollingEvent: async (event: JsonObject) => event,
      acknowledgeEvents: async () => ({ accepted: true as const, httpStatus: 202 }),
    };
    const pollingService = new MarketplacePollingService(
      prisma as never,
      {
        get: (key: string) => (
          key === 'MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED' || key === 'MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED'
            ? 'true'
            : undefined
        ),
      } as never,
      { get: () => fakeProvider } as never,
      { persistParsedEvent: async () => ({ accepted: true, duplicate: false, inboxId: 'unused' }) } as never,
      { resolveTenantFeature: async () => ({ enabled: true }) } as never,
    );
    await assert.rejects(pollingService.runConnection({
      schemaVersion: 2, tokenDeviceKey: `connection:${connectionAId}`,
      connections: [{ tenantId: alphaUser.tenantId, connectionId: connectionAId }], scheduledAt: new Date().toISOString(),
    }));
    await pollingService.runConnection({
      schemaVersion: 2, tokenDeviceKey: `connection:${connectionBId}`,
      connections: [{ tenantId: alphaUser.tenantId, connectionId: connectionBId }], scheduledAt: new Date().toISOString(),
    });
    const [polledA, polledB] = await Promise.all([
      prisma.marketplaceConnection.findUniqueOrThrow({ where: { id: connectionAId } }),
      prisma.marketplaceConnection.findUniqueOrThrow({ where: { id: connectionBId } }),
    ]);
    assert.equal(polledA.pollingStatus, MarketplacePollingStatus.DEGRADED);
    assert.equal(polledB.pollingStatus, MarketplacePollingStatus.HEALTHY);
    checks.push('provider failure A does not block polling B');

    const credentialConfig = new ConfigService({
      MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY: process.env.MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY,
      MARKETPLACE_CREDENTIALS_KEY_VERSION: process.env.MARKETPLACE_CREDENTIALS_KEY_VERSION ?? 'e2e',
      MARKETPLACE_IFOOD_CLIENT_ID: 'fake-client-id',
      MARKETPLACE_IFOOD_CLIENT_SECRET: 'fake-client-secret',
      MARKETPLACE_IFOOD_API_BASE_URL: 'http://127.0.0.1:1/fake-ifood',
    });
    const credentialService = new MarketplaceCredentialService(credentialConfig);
    const tokenService = new IfoodTokenService(prisma as never, credentialConfig, credentialService);
    const beforeRefreshB = await prisma.marketplaceConnection.findUniqueOrThrow({ where: { id: connectionBId } });
    const originalFetch = global.fetch;
    let refreshCalls = 0;
    global.fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      refreshCalls += 1;
      const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init?.body ?? ''));
      assert.equal(body.get('refreshToken'), 'fake-refresh-alpha-a');
      return new Response(JSON.stringify({ accessToken: 'fake-refreshed-access-a', refreshToken: 'fake-refreshed-refresh-a', expiresIn: 3600 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    try {
      await tokenService.getAccessToken(polledA, true);
    } finally {
      global.fetch = originalFetch;
    }
    const [afterRefreshA, afterRefreshB] = await Promise.all([
      prisma.marketplaceConnection.findUniqueOrThrow({ where: { id: connectionAId } }),
      prisma.marketplaceConnection.findUniqueOrThrow({ where: { id: connectionBId } }),
    ]);
    assert.equal(refreshCalls, 1);
    assert.notEqual(afterRefreshA.accessTokenEnc, polledA.accessTokenEnc);
    assert.equal(afterRefreshB.accessTokenEnc, beforeRefreshB.accessTokenEnc);
    assert.equal(afterRefreshB.refreshTokenEnc, beforeRefreshB.refreshTokenEnc);
    checks.push('refresh A leaves token material B unchanged');

    await prisma.marketplaceConnection.updateMany({
      where: { id: { in: [connectionAId, connectionBId] } },
      data: {
        status: MarketplaceConnectionStatus.CONNECTED,
        pollingStatus: MarketplacePollingStatus.DISABLED,
        pollingLastAttemptAt: null,
        pollingLastError: null,
        settingsJson: { pollingFallbackEnabled: false, presenceMode: 'WEBHOOK', autoConfirmOrders: false, importAsStatus: 'pending' },
      },
    });

    const externalOrderId = 'order-001';
    const eventA = orderEvent('event-alpha-a-001', 'merchant-alpha-a', 'store-alpha-a', externalOrderId);
    const eventB = orderEvent('event-alpha-b-001', 'merchant-alpha-b', 'store-alpha-b', externalOrderId);
    const acceptedA = await anonymous.request<JsonObject>('POST', '/webhooks/marketplaces/ifood', eventA, [202], { 'x-marketplace-smoke': 'true' });
    const acceptedB = await anonymous.request<JsonObject>('POST', '/webhooks/marketplaces/ifood', eventB, [202], { 'x-marketplace-smoke': 'true' });
    assert.equal(acceptedA.duplicate, false);
    assert.equal(acceptedB.duplicate, false);
    const marketplaceOrders = await alpha.request<JsonObject[]>('GET', '/marketplaces/orders');
    const sharedOrders = marketplaceOrders.filter((row) => row.externalOrderId === externalOrderId);
    assert.equal(sharedOrders.length, 2);
    const orderA = sharedOrders.find((row) => row.connectionId === connectionAId);
    const orderB = sharedOrders.find((row) => row.connectionId === connectionBId);
    assert.ok(orderA);
    assert.ok(orderB);
    const internalOrderAId = readString(orderA, 'internalOrderId');
    checks.push('same external order id produces two connection-scoped orders');

    const replay = await anonymous.request<JsonObject>('POST', '/webhooks/marketplaces/ifood', eventA, [202], { 'x-marketplace-smoke': 'true' });
    assert.equal(replay.duplicate, true);
    const replayEvents = await alpha.request<JsonObject[]>('GET', '/marketplaces/events?eventId=event-alpha-a-001');
    assert.equal(replayEvents.length, 1);
    assert.equal(replayEvents[0].duplicateCount, 1);
    assert.equal(await prisma.marketplaceOrder.count({ where: { tenantId: alphaUser.tenantId, externalOrderId } }), 2);
    assert.equal(await prisma.order.count({ where: { tenantId: alphaUser.tenantId, idempotencyKey: { contains: externalOrderId } } }), 2);
    checks.push('event replay does not duplicate inbox, marketplace order or internal order');

    const unknownEvent = orderEvent('event-unknown-001', 'merchant-unknown', 'store-unknown', 'order-unknown');
    await anonymous.request('POST', '/webhooks/marketplaces/ifood', unknownEvent, [400], {
      'x-marketplace-smoke': 'true', authorization: 'Bearer fake-unknown-authorization',
    });
    const unknownInbox = await prisma.marketplaceEventInbox.findFirstOrThrow({ where: { eventId: 'event-unknown-001' } });
    assert.equal(unknownInbox.tenantId, null);
    assert.equal(unknownInbox.connectionId, null);
    assert.equal(unknownInbox.status, 'FAILED');
    assert.equal(await prisma.marketplaceOrder.count({ where: { externalOrderId: 'order-unknown' } }), 0);
    assert.equal((unknownInbox.headersJson as JsonObject).authorization, '***');
    checks.push('unknown merchant remains unassigned and sensitive headers are redacted');

    await prisma.marketplaceOrder.update({
      where: {
        connectionId_provider_externalOrderId: {
          connectionId: connectionAId,
          provider: MarketplaceProvider.IFOOD,
          externalOrderId,
        },
      },
      data: { internalOrderId: null },
    });
    await alpha.request('PATCH', `/orders/${internalOrderAId}/status`, { status: 'confirmed', note: 'multi-ifood e2e confirmed' });
    assert.equal(await prisma.printJob.count({ where: { tenantId: alphaUser.tenantId, orderId: internalOrderAId, type: PrintType.kitchen } }), 0);
    await alpha.request('PATCH', `/orders/${internalOrderAId}/status`, { status: 'preparing', note: 'multi-ifood e2e preparing' });
    assert.equal(await prisma.printJob.count({ where: { tenantId: alphaUser.tenantId, orderId: internalOrderAId, type: PrintType.kitchen } }), 1);
    const kdsService = new KdsService(
      prisma as never,
      { getTenantId: () => alphaUser.tenantId } as never,
      { formatTicket: async () => 'fake local kitchen ticket' } as never,
    );
    assert.deepEqual(await kdsService.createProductionJobs(internalOrderAId, alphaUser.tenantId), []);
    assert.equal(await prisma.printJob.count({ where: { tenantId: alphaUser.tenantId, orderId: internalOrderAId, type: PrintType.kitchen } }), 1);
    await alpha.request('PATCH', `/orders/${internalOrderAId}/status`, { status: 'ready_for_delivery', note: 'multi-ifood e2e dispatch smoke' });
    const dispatchOrders = await alpha.request<JsonObject[]>('GET', '/orders/operation/dispatch');
    assert.ok(dispatchOrders.some((row) => row.id === internalOrderAId));
    await prisma.marketplaceOrder.update({
      where: {
        connectionId_provider_externalOrderId: {
          connectionId: connectionAId,
          provider: MarketplaceProvider.IFOOD,
          externalOrderId,
        },
      },
      data: { internalOrderId: internalOrderAId },
    });
    checks.push('KDS lifecycle/retry and dispatch listing remain correct');

    await alpha.request('POST', `/marketplaces/connections/${connectionAId}/disconnect`, {});
    const isolatedStatuses = await alpha.request<JsonObject[]>('GET', '/marketplaces/connections');
    assert.equal(isolatedStatuses.find((row) => row.id === connectionAId)?.status, 'DISCONNECTED');
    assert.equal(isolatedStatuses.find((row) => row.id === connectionBId)?.status, 'CONNECTED');
    await anonymous.request('POST', '/webhooks/marketplaces/ifood', orderEvent(
      'event-alpha-b-after-a-failure', 'merchant-alpha-b', 'store-alpha-b', 'order-b-after-a-failure',
    ), [202], { 'x-marketplace-smoke': 'true' });
    assert.equal(await prisma.marketplaceOrder.count({ where: { connectionId: connectionBId, externalOrderId: 'order-b-after-a-failure' } }), 1);
    checks.push('connection B remains processable after connection A is disconnected');

    console.log(JSON.stringify({
      result: 'MULTI_IFOOD_E2E_PASS',
      runId,
      alpha: { tenantId: alphaUser.tenantId, slug: alphaUser.tenant.slug, email: alphaEmail, connectionAId, connectionBId },
      beta: { tenantId: betaUser.tenantId, slug: betaUser.tenant.slug, email: betaEmail, connectionCId },
      checks,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
